// Overlay renderer. Owns MediaRecorder + Web Audio waveform. Driven entirely
// by IPC from the main process — never listens to hotkeys itself.

declare global {
  interface Window {
    overlayAPI: {
      onStart: (cb: () => void) => void;
      onStop: (cb: () => void) => void;
      onCancel: (cb: () => void) => void;
      sendRecorded: (bytes: ArrayBuffer, durationSec: number) => void;
      sendDiscarded: () => void;
      sendError: (msg: string) => void;
      getMicId: () => Promise<string>;
    };
  }
}

const overlayEl = document.getElementById('overlay') as HTMLDivElement;
const canvas = document.getElementById('wave') as HTMLCanvasElement;
const timerEl = document.getElementById('timer') as HTMLDivElement;
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
  ctx2d.lineWidth = 2 * dpr;
  ctx2d.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx2d.beginPath();
  const step = w / buf.length;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] / 128 - 1; // -1..1
    const x = i * step;
    const y = h / 2 + v * (h / 2) * 0.9;
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
  rafId = requestAnimationFrame(drawWave);
}

async function startRecording() {
  canceled = false;
  chunks = [];
  startTs = Date.now();

  // Animate in.
  overlayEl.classList.remove('leaving', 'cancel');
  overlayEl.classList.add('enter', 'recording');

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
  const src = audioCtx.createMediaStreamSource(mediaStream);
  src.connect(analyser);

  const mime = pickMime();
  try {
    recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    window.overlayAPI.sendError(`Recorder error: ${(err as Error).message}`);
    return;
  }
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = onRecorderStop;
  recorder.start(100);

  drawWave();
  timerId = window.setInterval(() => {
    timerEl.textContent = fmtTime(Date.now() - startTs);
  }, 100);
}

function pickMime(): string {
  const prefs = [
    'audio/ogg;codecs=opus',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
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

  // Play leaving animation, then hide is controlled by main after ack.
  overlayEl.classList.remove('enter');
  overlayEl.classList.add('leaving');

  if (canceled) {
    window.overlayAPI.sendDiscarded();
    return;
  }

  try {
    const buf = await blob.arrayBuffer();
    window.overlayAPI.sendRecorded(buf, durationSec);
  } catch (err) {
    window.overlayAPI.sendError(`Encode failed: ${(err as Error).message}`);
  }
}

function cancelRecording() {
  canceled = true;
  overlayEl.classList.add('cancel');
  stopRecorder(); // onstop will see canceled=true and send discarded
}

window.overlayAPI.onStart(() => void startRecording());
window.overlayAPI.onStop(() => stopRecorder());
window.overlayAPI.onCancel(() => cancelRecording());
