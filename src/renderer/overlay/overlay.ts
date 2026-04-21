// Overlay renderer. Owns MediaRecorder + Web Audio waveform + subtle SFX.
// Driven entirely by IPC from the main process.

declare global {
  interface Window {
    overlayAPI: {
      onStart: (cb: () => void) => void;
      onStop: (cb: () => void) => void;
      onCancel: (cb: () => void) => void;
      onSent: (cb: () => void) => void;
      onSendFailed: (cb: (msg: string) => void) => void;
      onTooShort: (cb: () => void) => void;
      sendRecorded: (bytes: ArrayBuffer, durationSec: number) => void;
      sendDiscarded: () => void;
      sendError: (msg: string) => void;
      getMicId: () => Promise<string>;
    };
  }
}

const wrapEl = document.querySelector('.wrap') as HTMLDivElement;
const overlayEl = document.getElementById('overlay') as HTMLDivElement;
const canvas = document.getElementById('wave') as HTMLCanvasElement;
const timerEl = document.getElementById('timer') as HTMLDivElement;
const captionEl = document.getElementById('caption') as HTMLDivElement;
const ctx2d = canvas.getContext('2d')!;

let mediaStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let rafId: number | null = null;
let timerId: number | null = null;
let startTs = 0;
let canceled = false;

// ---- sound effects --------------------------------------------------------
// Synthesised tones keep the app asset-free and guarantee sub-frame latency.
// Shared context so the first tone doesn't pay AudioContext startup cost.
let sfxCtx: AudioContext | null = null;
function getSfx(): AudioContext {
  if (!sfxCtx) sfxCtx = new AudioContext();
  return sfxCtx;
}

interface Tone {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number; // linear ramp destination for a subtle chirp
}

function playTones(tones: Tone[]) {
  try {
    const ctx = getSfx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => void 0);
    let t = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.freq, t);
      if (tone.slideTo) osc.frequency.linearRampToValueAtTime(tone.slideTo, t + tone.duration);
      const peak = tone.gain ?? 0.07;
      // Short attack/release to avoid clicks.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + tone.duration + 0.02);
      t += tone.duration;
    }
  } catch {
    // Audio not ready — SFX are non-essential.
  }
}

const sfx = {
  start: () => playTones([{ freq: 520, slideTo: 720, duration: 0.09, gain: 0.06 }]),
  stop:  () => playTones([{ freq: 620, slideTo: 420, duration: 0.09, gain: 0.06 }]),
  sent:  () => playTones([
    { freq: 660, duration: 0.08, gain: 0.05 },
    { freq: 880, duration: 0.12, gain: 0.06 },
  ]),
  cancel: () => playTones([{ freq: 300, slideTo: 180, duration: 0.12, gain: 0.05, type: 'triangle' }]),
  short:  () => playTones([{ freq: 360, duration: 0.18, gain: 0.05, type: 'triangle' }]),
};

// ---- ui helpers -----------------------------------------------------------

function setState(cls: 'recording' | 'cancel' | 'sent' | 'short' | null, caption?: string) {
  overlayEl.classList.remove('recording', 'cancel', 'sent', 'short');
  captionEl.classList.remove('cancel', 'sent', 'short');
  if (cls) {
    overlayEl.classList.add(cls);
    if (cls !== 'recording') captionEl.classList.add(cls);
  }
  if (caption) captionEl.innerHTML = caption;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

function drawWave() {
  if (!analyser) return;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width = canvas.clientWidth * dpr;
  const h = canvas.height = canvas.clientHeight * dpr;

  ctx2d.clearRect(0, 0, w, h);
  ctx2d.lineWidth = 1.8 * dpr;
  ctx2d.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx2d.beginPath();
  const step = w / buf.length;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] / 128 - 1;
    const x = i * step;
    const y = h / 2 + v * (h / 2) * 0.9;
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
  rafId = requestAnimationFrame(drawWave);
}

// ---- recording flow -------------------------------------------------------

async function startRecording() {
  canceled = false;
  chunks = [];
  startTs = Date.now();

  wrapEl.classList.remove('leaving');
  wrapEl.classList.add('enter');
  setState('recording', 'Recording with <strong>Whisper Poke</strong>');
  timerEl.textContent = '0:00';
  sfx.start();

  try {
    const micId = await window.overlayAPI.getMicId();
    const constraints: MediaStreamConstraints = {
      audio: micId
        ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true },
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    window.overlayAPI.sendError(`Microphone error: ${(err as Error).message}`);
    return;
  }

  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  audioCtx.createMediaStreamSource(mediaStream).connect(analyser);

  const mime = pickMime();
  try {
    recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    window.overlayAPI.sendError(`Recorder error: ${(err as Error).message}`);
    return;
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = onRecorderStop;
  recorder.start(100);

  drawWave();
  timerId = window.setInterval(() => {
    timerEl.textContent = fmtTime(Date.now() - startTs);
  }, 100);
}

function pickMime(): string {
  const prefs = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const m of prefs) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function stopRecorder() {
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); } catch { /* ignore */ }
  }
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  if (timerId != null) { clearInterval(timerId); timerId = null; }
}

function teardownStream() {
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  if (audioCtx) { audioCtx.close().catch(() => void 0); audioCtx = null; }
  analyser = null;
}

async function onRecorderStop() {
  const durationSec = (Date.now() - startTs) / 1000;
  const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/ogg' });
  chunks = [];
  teardownStream();

  if (canceled) {
    window.overlayAPI.sendDiscarded();
    return;
  }

  sfx.stop();

  try {
    const buf = await blob.arrayBuffer();
    window.overlayAPI.sendRecorded(buf, durationSec);
  } catch (err) {
    window.overlayAPI.sendError(`Encode failed: ${(err as Error).message}`);
  }
}

function cancelRecording() {
  canceled = true;
  setState('cancel', 'Canceled — nothing sent');
  sfx.cancel();
  stopRecorder();
}

function flashLeaving(delayMs = 450) {
  setTimeout(() => {
    wrapEl.classList.remove('enter');
    wrapEl.classList.add('leaving');
  }, delayMs);
}

window.overlayAPI.onStart(() => void startRecording());
window.overlayAPI.onStop(() => stopRecorder());
window.overlayAPI.onCancel(() => cancelRecording());
window.overlayAPI.onSent(() => {
  setState('sent', 'Sent to Poke');
  sfx.sent();
  flashLeaving();
});
window.overlayAPI.onSendFailed((msg) => {
  setState('cancel', `Failed: ${msg || 'send error'}`);
  sfx.cancel();
  flashLeaving();
});
window.overlayAPI.onTooShort(() => {
  setState('short', 'Too short — hold longer');
  sfx.short();
  flashLeaving();
});
