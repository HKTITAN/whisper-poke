interface QSFileAttach { path: string; name: string; size: number; }
interface QSVoice { bytes: ArrayBuffer; durationSec: number; }
interface QSVideo { bytes: ArrayBuffer; durationSec: number; mime: string; }
interface QSSubmitPayload {
  text: string;
  voice?: QSVoice;
  video?: QSVideo;
  files: QSFileAttach[];
}

declare global {
  interface Window {
    quickSendAPI: {
      close: () => void;
      pickFiles: () => Promise<QSFileAttach[]>;
      submit: (payload: QSSubmitPayload) => void;
      getMicId: () => Promise<string>;
      onStatus: (cb: (msg: string) => void) => void;
      onSent: (cb: () => void) => void;
      onFailed: (cb: (err: string) => void) => void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input       = $<HTMLTextAreaElement>('qs-input');
const attachEl    = $<HTMLDivElement>('qs-attachments');
const statusEl    = $<HTMLDivElement>('qs-status');
const sendBtn     = $<HTMLButtonElement>('qs-send');
const btnMic      = $<HTMLButtonElement>('qs-btn-mic');
const btnFiles    = $<HTMLButtonElement>('qs-btn-files');
const btnVideo    = $<HTMLButtonElement>('qs-btn-video');
const recorderEl  = $<HTMLDivElement>('qs-recorder');
const recLabel    = $<HTMLSpanElement>('qs-rec-label');
const recTimer    = $<HTMLSpanElement>('qs-rec-timer');
const recStop     = $<HTMLButtonElement>('qs-rec-stop');
const recCancel   = $<HTMLButtonElement>('qs-rec-cancel');
const videoPrev   = $<HTMLVideoElement>('qs-video-preview');

// ---- attachment state -----------------------------------------------------
let voice: QSVoice | null = null;
let video: QSVideo | null = null;
let files: QSFileAttach[] = [];
let submitting = false;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function renderAttachments() {
  attachEl.innerHTML = '';
  const pills: HTMLElement[] = [];

  if (voice) {
    const p = buildPill('🎤', 'Voice note', fmtDuration(voice.durationSec), () => {
      voice = null;
      renderAttachments();
      syncSendEnabled();
    });
    pills.push(p);
  }
  if (video) {
    const p = buildPill('📹', 'Video snippet', fmtDuration(video.durationSec), () => {
      video = null;
      renderAttachments();
      syncSendEnabled();
    });
    pills.push(p);
  }
  for (const f of files) {
    const p = buildPill('📎', f.name, fmtSize(f.size), () => {
      files = files.filter((x) => x !== f);
      renderAttachments();
      syncSendEnabled();
    });
    pills.push(p);
  }

  if (pills.length === 0) {
    attachEl.hidden = true;
  } else {
    attachEl.hidden = false;
    pills.forEach((p) => attachEl.appendChild(p));
  }
}

function buildPill(icon: string, name: string, meta: string, onRemove: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'qs-pill';
  const iconEl = document.createElement('span');
  iconEl.className = 'qs-pill-icon';
  iconEl.textContent = icon;
  const nameEl = document.createElement('span');
  nameEl.className = 'qs-pill-name';
  nameEl.textContent = name;
  const metaEl = document.createElement('span');
  metaEl.className = 'qs-pill-meta';
  metaEl.textContent = meta;
  const x = document.createElement('button');
  x.className = 'qs-pill-x';
  x.textContent = '×';
  x.title = 'Remove';
  x.addEventListener('click', onRemove);
  el.append(iconEl, nameEl, metaEl, x);
  return el;
}

function syncSendEnabled() {
  const hasContent =
    input.value.trim().length > 0 ||
    !!voice || !!video || files.length > 0;
  sendBtn.disabled = !hasContent || submitting;
}

function setStatus(msg: string, kind: '' | 'error' | 'sending' | 'ok' = '') {
  statusEl.textContent = msg;
  statusEl.className = 'qs-status' + (kind ? ' ' + kind : '');
}

// ---- recorder (shared for audio + video) ----------------------------------
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordStart = 0;
let recordTimerId: number | null = null;
let recordMode: 'voice' | 'video' | null = null;
let recordChunks: Blob[] = [];

function stopStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}
function clearRecorder() {
  stopStream();
  mediaRecorder = null;
  recordMode = null;
  recordChunks = [];
  if (recordTimerId !== null) { window.clearInterval(recordTimerId); recordTimerId = null; }
  recorderEl.hidden = true;
  videoPrev.hidden = true;
  videoPrev.srcObject = null;
  btnMic.classList.remove('active');
  btnVideo.classList.remove('active');
}

async function startRecording(mode: 'voice' | 'video') {
  if (recordMode || submitting) return;
  recordMode = mode;
  recordChunks = [];

  try {
    if (mode === 'voice') {
      const micId = await window.quickSendAPI.getMicId();
      const constraints: MediaStreamConstraints = {
        audio: micId
          ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      };
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const mime = pickMime(['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm']);
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
      recLabel.textContent = 'Recording voice…';
      videoPrev.hidden = true;
      btnMic.classList.add('active');
    } else {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: 30 },
        audio: true,
      });
      const mime = pickMime(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']);
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
      videoPrev.srcObject = mediaStream;
      videoPrev.hidden = false;
      await videoPrev.play().catch(() => { /* non-fatal */ });
      recLabel.textContent = 'Recording video…';
      btnVideo.classList.add('active');
    }
  } catch (e) {
    clearRecorder();
    setStatus(`Could not start: ${(e as Error).message}`, 'error');
    return;
  }

  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) recordChunks.push(ev.data);
  };
  mediaRecorder.onstop = () => finishRecording();
  mediaRecorder.start(250);
  recordStart = performance.now();
  recorderEl.hidden = false;
  recTimer.textContent = '0:00';
  recordTimerId = window.setInterval(() => {
    const elapsed = (performance.now() - recordStart) / 1000;
    recTimer.textContent = fmtDuration(elapsed);
  }, 200);
}

function pickMime(candidates: string[]): string {
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function finishRecording() {
  if (!recordMode) { clearRecorder(); return; }
  const mode = recordMode;
  const durationSec = (performance.now() - recordStart) / 1000;
  const mime = mediaRecorder?.mimeType || (mode === 'voice' ? 'audio/webm' : 'video/webm');
  const blob = new Blob(recordChunks, { type: mime });
  const bytes = await blob.arrayBuffer();

  if (mode === 'voice') {
    voice = { bytes, durationSec };
  } else {
    video = { bytes, durationSec, mime };
  }
  clearRecorder();
  renderAttachments();
  syncSendEnabled();
}

function cancelRecording() {
  if (!mediaRecorder) { clearRecorder(); return; }
  try { mediaRecorder.ondataavailable = null; mediaRecorder.onstop = null; mediaRecorder.stop(); } catch {/*ignore*/}
  clearRecorder();
}

// ---- events ---------------------------------------------------------------
input.addEventListener('input', syncSendEnabled);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (recordMode) cancelRecording();
    else window.quickSendAPI.close();
  }
});

document.addEventListener('keydown', (e) => {
  if (document.activeElement === input) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (recordMode) cancelRecording();
    else window.quickSendAPI.close();
  }
});

sendBtn.addEventListener('click', () => submit());

btnMic.addEventListener('click', () => {
  if (recordMode === 'voice') { mediaRecorder?.stop(); return; }
  void startRecording('voice');
});
btnVideo.addEventListener('click', () => {
  if (recordMode === 'video') { mediaRecorder?.stop(); return; }
  void startRecording('video');
});
btnFiles.addEventListener('click', async () => {
  const picked = await window.quickSendAPI.pickFiles();
  if (picked && picked.length > 0) {
    files = files.concat(picked);
    renderAttachments();
    syncSendEnabled();
  }
});
recStop.addEventListener('click', () => mediaRecorder?.stop());
recCancel.addEventListener('click', () => cancelRecording());

function submit() {
  if (submitting) return;
  const text = input.value.trim();
  if (!text && !voice && !video && files.length === 0) return;
  submitting = true;
  sendBtn.disabled = true;
  setStatus('Sending…', 'sending');
  window.quickSendAPI.submit({ text, voice: voice || undefined, video: video || undefined, files });
}

window.quickSendAPI.onStatus((msg) => setStatus(msg, 'sending'));
window.quickSendAPI.onSent(() => {
  setStatus('Sent ✓', 'ok');
  setTimeout(() => window.quickSendAPI.close(), 360);
});
window.quickSendAPI.onFailed((err) => {
  submitting = false;
  setStatus(err || 'Send failed', 'error');
  syncSendEnabled();
});

input.focus();
syncSendEnabled();
