declare global {
  interface Window {
    micTestAPI: { getMicId: () => Promise<string> };
  }
}

const meter = document.getElementById('meter-fill') as HTMLDivElement;
const canvas = document.getElementById('wave') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const closeBtn = document.getElementById('close') as HTMLButtonElement;
const ctx2d = canvas.getContext('2d')!;

let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let rafId: number | null = null;

async function start() {
  try {
    const micId = await window.micTestAPI.getMicId();
    const constraints: MediaStreamConstraints = {
      audio: micId
        ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true },
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    statusEl.textContent = 'Listening — try saying something';
    statusEl.classList.add('ok');
    loop();
  } catch (err) {
    statusEl.textContent = `Microphone error: ${(err as Error).message}`;
    statusEl.classList.add('err');
  }
}

function loop() {
  if (!analyser) return;
  const time = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(time);

  // Peak-ish level for the meter.
  let peak = 0;
  for (let i = 0; i < time.length; i++) {
    const v = Math.abs(time[i] - 128);
    if (v > peak) peak = v;
  }
  const level = Math.min(1, peak / 110);
  meter.style.width = `${Math.round(level * 100)}%`;

  // Waveform.
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width = canvas.clientWidth * dpr;
  const h = canvas.height = canvas.clientHeight * dpr;
  ctx2d.clearRect(0, 0, w, h);

  const grad = ctx2d.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(255, 138, 94, 0.95)');
  grad.addColorStop(1, 'rgba(255, 77, 85, 0.95)');
  ctx2d.lineWidth = 1.8 * dpr;
  ctx2d.strokeStyle = grad;
  ctx2d.lineCap = 'round';
  ctx2d.beginPath();
  const step = w / time.length;
  for (let i = 0; i < time.length; i++) {
    const v = time[i] / 128 - 1;
    const x = i * step;
    const y = h / 2 + v * (h / 2) * 0.9;
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();

  rafId = requestAnimationFrame(loop);
}

function teardown() {
  if (rafId != null) cancelAnimationFrame(rafId);
  stream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close().catch(() => void 0);
}

closeBtn.addEventListener('click', () => window.close());
window.addEventListener('beforeunload', teardown);

start();
