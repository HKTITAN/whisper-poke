// Overlay renderer. Owns MediaRecorder + Web Audio waveform + Web Speech API
// live transcription + richer SFX. Driven entirely by IPC from main.

type Mode = 'hold' | 'toggle';
type Kind = 'voice' | 'screen';

declare global {
  interface Window {
    overlayAPI: {
      onStart: (cb: (p: { mode: Mode; kind: Kind; showTranscript: boolean }) => void) => void;
      onStop: (cb: () => void) => void;
      onCancel: (cb: () => void) => void;
      onSent: (cb: () => void) => void;
      onSendFailed: (cb: (msg: string) => void) => void;
      onTooShort: (cb: () => void) => void;
      sendRecorded: (
        bytes: ArrayBuffer,
        durationSec: number,
        transcript: string,
        kind?: Kind,
        mime?: string,
      ) => void;
      sendDiscarded: () => void;
      sendError: (msg: string) => void;
      getMicId: () => Promise<string>;
      commit: () => void;
      requestCancel: () => void;
      setMouseThrough: (through: boolean) => void;
    };
  }
}

const wrapEl = document.getElementById('wrap') as HTMLDivElement;
const overlayEl = document.getElementById('overlay') as HTMLDivElement;
const canvas = document.getElementById('wave') as HTMLCanvasElement;
const timerEl = document.getElementById('timer') as HTMLDivElement;
const captionEl = document.getElementById('caption') as HTMLDivElement;
const controlsEl = document.getElementById('controls') as HTMLDivElement;
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;
const btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement;
const transcriptEl = document.getElementById('transcript') as HTMLDivElement;
const transcriptFinalEl = document.getElementById('transcript-final') as HTMLSpanElement;
const transcriptInterimEl = document.getElementById('transcript-interim') as HTMLSpanElement;
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
let currentMode: Mode = 'hold';
let currentKind: Kind = 'voice';
let currentMime = '';
let transcriptVisible = true;

// ---- SFX -----------------------------------------------------------------
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
  slideTo?: number;
  delay?: number;      // offset from start
  attack?: number;
  release?: number;
}

function playTones(tones: Tone[]) {
  try {
    const ctx = getSfx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => void 0);
    const base = ctx.currentTime;
    for (const tone of tones) {
      const t0 = base + (tone.delay ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.freq, t0);
      if (tone.slideTo) osc.frequency.linearRampToValueAtTime(tone.slideTo, t0 + tone.duration);
      const peak = tone.gain ?? 0.07;
      const attack = tone.attack ?? 0.008;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + tone.duration + 0.03);
    }
  } catch { /* non-essential */ }
}

const sfx = {
  // Bright ascending two-note chirp for start — crisp and confident.
  start: () => playTones([
    { freq: 440, slideTo: 660, duration: 0.09, gain: 0.05, type: 'sine' },
    { freq: 660, slideTo: 880, duration: 0.08, gain: 0.06, type: 'sine', delay: 0.05 },
    { freq: 1320, duration: 0.06, gain: 0.025, type: 'triangle', delay: 0.1 },
  ]),
  // Descending "closing" sound for stop — signals end of recording.
  stop: () => playTones([
    { freq: 760, slideTo: 520, duration: 0.1, gain: 0.06, type: 'sine' },
    { freq: 520, slideTo: 380, duration: 0.09, gain: 0.045, type: 'sine', delay: 0.06 },
  ]),
  // Whoosh-up for sending — layered tones rising quickly.
  sending: () => playTones([
    { freq: 380, slideTo: 720, duration: 0.18, gain: 0.05, type: 'sine' },
    { freq: 560, slideTo: 1040, duration: 0.18, gain: 0.03, type: 'triangle', delay: 0.02 },
  ]),
  // Confident chime for sent — major triad with slight delay.
  sent: () => playTones([
    { freq: 660,  duration: 0.09, gain: 0.05, type: 'sine' },
    { freq: 880,  duration: 0.11, gain: 0.055, type: 'sine', delay: 0.06 },
    { freq: 1318, duration: 0.16, gain: 0.05, type: 'sine', delay: 0.13 },
  ]),
  cancel: () => playTones([
    { freq: 320, slideTo: 180, duration: 0.14, gain: 0.05, type: 'triangle' },
    { freq: 180, slideTo: 120, duration: 0.1, gain: 0.035, type: 'sine', delay: 0.08 },
  ]),
  short: () => playTones([{ freq: 360, duration: 0.2, gain: 0.05, type: 'triangle' }]),
  // Subtle tick when transcription finalizes a new chunk (haptic-like cue).
  tick: () => playTones([{ freq: 1200, duration: 0.02, gain: 0.015, type: 'sine', attack: 0.003 }]),
};

// ---- Web Speech API wrapper ----------------------------------------------
// Chromium exposes webkitSpeechRecognition (uses Google servers). This is a
// best-effort live preview — the authoritative text for Poke is still the
// audio itself. If it fails (offline, blocked, unsupported), we silently drop
// the transcript feature and carry on.

interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionCtor { new(): SpeechRecognitionLike; }

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let recognition: SpeechRecognitionLike | null = null;
let transcriptFinal = '';
let transcriptInterim = '';
let wantsRestart = false;

function resetTranscript() {
  transcriptFinal = '';
  transcriptInterim = '';
  transcriptFinalEl.textContent = '';
  transcriptInterimEl.textContent = '';
}

function renderTranscript() {
  transcriptFinalEl.textContent = transcriptFinal;
  transcriptInterimEl.textContent = transcriptInterim ? ' ' + transcriptInterim : '';
}

function startTranscription() {
  if (!transcriptVisible) return;
  const Ctor = getSpeechRecognition();
  if (!Ctor) {
    transcriptEl.hidden = true;
    return;
  }
  try {
    recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    let lastFinalLen = 0;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      let finalAdd = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) finalAdd += text;
        else interim += text;
      }
      if (finalAdd) {
        transcriptFinal = (transcriptFinal + ' ' + finalAdd).trim();
        if (transcriptFinal.length > lastFinalLen) {
          sfx.tick();
          lastFinalLen = transcriptFinal.length;
        }
      }
      transcriptInterim = interim.trim();
      renderTranscript();
    };
    recognition.onerror = () => { /* swallow — no-network etc. */ };
    recognition.onend = () => {
      // Chrome's recognizer sometimes times out; restart silently while
      // recording is still in progress.
      if (wantsRestart && recognition) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    wantsRestart = true;
    transcriptEl.hidden = false;
    recognition.start();
  } catch {
    recognition = null;
    transcriptEl.hidden = true;
  }
}

function stopTranscription() {
  wantsRestart = false;
  if (recognition) {
    try { recognition.stop(); } catch { /* ignore */ }
    recognition = null;
  }
}

function currentTranscriptText(): string {
  const interim = transcriptInterim.trim();
  const all = interim ? (transcriptFinal + ' ' + interim).trim() : transcriptFinal.trim();
  return all;
}

// ---- UI helpers -----------------------------------------------------------

function setState(cls: 'recording' | 'cancel' | 'sent' | 'short' | 'sending' | null, caption?: string) {
  overlayEl.classList.remove('recording', 'cancel', 'sent', 'short', 'sending');
  captionEl.classList.remove('cancel', 'sent', 'short', 'sending');
  wrapEl.classList.remove('is-recording', 'is-sent', 'is-cancel', 'is-sending');
  if (cls) {
    overlayEl.classList.add(cls);
    if (cls !== 'recording') captionEl.classList.add(cls);
    if (cls === 'recording') wrapEl.classList.add('is-recording');
    if (cls === 'sending')   wrapEl.classList.add('is-sending');
    if (cls === 'sent')      wrapEl.classList.add('is-sent');
    if (cls === 'cancel')    wrapEl.classList.add('is-cancel');
  }
  // kind-voice / kind-screen: drives which glyph path shows during recording.
  wrapEl.classList.remove('kind-voice', 'kind-screen');
  wrapEl.classList.add(currentKind === 'screen' ? 'kind-screen' : 'kind-voice');
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

  // Gradient stroke for more visual punch.
  const grad = ctx2d.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(255, 138, 94, 0.95)');
  grad.addColorStop(1, 'rgba(255, 77, 85, 0.95)');

  ctx2d.lineWidth = 2 * dpr;
  ctx2d.strokeStyle = grad;
  ctx2d.lineCap = 'round';
  ctx2d.lineJoin = 'round';
  ctx2d.beginPath();
  const step = w / buf.length;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] / 128 - 1;
    const x = i * step;
    const y = h / 2 + v * (h / 2) * 0.92;
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
  rafId = requestAnimationFrame(drawWave);
}

// ---- recording flow -------------------------------------------------------

async function startRecording(payload: { mode: Mode; kind: Kind; showTranscript: boolean }) {
  canceled = false;
  chunks = [];
  startTs = Date.now();
  currentMode = payload.mode;
  currentKind = payload.kind || 'voice';
  transcriptVisible = payload.showTranscript && currentKind === 'voice';
  resetTranscript();

  wrapEl.classList.remove('leaving');
  wrapEl.classList.add('enter');
  wrapEl.classList.add('ping');
  setTimeout(() => wrapEl.classList.remove('ping'), 450);

  const kindLabel = currentKind === 'screen' ? 'Recording screen' : 'Recording with <strong>Whisper Poke</strong>';
  const modeLabel = currentMode === 'toggle'
    ? (currentKind === 'screen' ? 'Toggle screen recording — tap hotkey or Send' : 'Toggle recording — tap hotkey or Send')
    : kindLabel;
  setState('recording', modeLabel);
  timerEl.textContent = '0:00';
  sfx.start();

  if (currentMode === 'toggle') {
    controlsEl.hidden = false;
    window.overlayAPI.setMouseThrough(false);
  } else {
    controlsEl.hidden = true;
    window.overlayAPI.setMouseThrough(true);
  }

  transcriptEl.hidden = !transcriptVisible;

  try {
    if (currentKind === 'screen') {
      // getDisplayMedia routes through main's setDisplayMediaRequestHandler
      // which auto-selects the primary screen + loopback audio.
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
      });
    } else {
      const micId = await window.overlayAPI.getMicId();
      const constraints: MediaStreamConstraints = {
        audio: micId
          ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      };
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    }
  } catch (err) {
    const label = currentKind === 'screen' ? 'Screen capture error' : 'Microphone error';
    window.overlayAPI.sendError(`${label}: ${(err as Error).message}`);
    return;
  }

  // Waveform only makes sense for audio-only recordings.
  if (currentKind === 'voice') {
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(mediaStream).connect(analyser);
  }

  const mime = pickMime(currentKind);
  currentMime = mime;
  try {
    recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    window.overlayAPI.sendError(`Recorder error: ${(err as Error).message}`);
    return;
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = onRecorderStop;
  recorder.start(currentKind === 'screen' ? 500 : 100);

  if (currentKind === 'voice') {
    startTranscription();
    drawWave();
  }
  timerId = window.setInterval(() => {
    timerEl.textContent = fmtTime(Date.now() - startTs);
  }, 100);
}

function pickMime(kind: Kind): string {
  const prefs = kind === 'screen'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
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
  stopTranscription();
}

function teardownStream() {
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  if (audioCtx) { audioCtx.close().catch(() => void 0); audioCtx = null; }
  analyser = null;
}

async function onRecorderStop() {
  const durationSec = (Date.now() - startTs) / 1000;
  const defaultType = currentKind === 'screen' ? 'video/webm' : 'audio/ogg';
  const blob = new Blob(chunks, { type: chunks[0]?.type || defaultType });
  chunks = [];
  teardownStream();

  if (canceled) {
    window.overlayAPI.sendDiscarded();
    return;
  }

  sfx.stop();
  setState('sending', 'Sending to Poke…');
  setTimeout(() => sfx.sending(), 120);

  try {
    const buf = await blob.arrayBuffer();
    window.overlayAPI.sendRecorded(
      buf,
      durationSec,
      currentTranscriptText(),
      currentKind,
      currentMime || blob.type,
    );
  } catch (err) {
    window.overlayAPI.sendError(`Encode failed: ${(err as Error).message}`);
  }
}

function cancelRecording() {
  canceled = true;
  setState('cancel', 'Canceled — nothing sent');
  sfx.cancel();
  stopRecorder();
  window.overlayAPI.setMouseThrough(true);
  controlsEl.hidden = true;
}

function flashLeaving(delayMs = 550) {
  setTimeout(() => {
    wrapEl.classList.remove('enter');
    wrapEl.classList.add('leaving');
    // Drop mouse pass-through to default once we're dismissing.
    window.overlayAPI.setMouseThrough(true);
    controlsEl.hidden = true;
  }, delayMs);
}

// ---- button wiring --------------------------------------------------------
btnSend.addEventListener('click', () => {
  window.overlayAPI.commit();
});
btnCancel.addEventListener('click', () => {
  window.overlayAPI.requestCancel();
});

// ---- IPC wiring -----------------------------------------------------------
window.overlayAPI.onStart((p) => void startRecording(p));
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
