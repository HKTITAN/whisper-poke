declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<{ hotkey: string[]; micDeviceId: string; loggedIn: boolean }>;
      set: (p: Record<string, unknown>) => Promise<{ hotkey: string[]; micDeviceId: string; loggedIn: boolean }>;
      captureHotkey: () => Promise<{ ok: boolean; combo?: string[]; error?: string }>;
      logout: () => Promise<boolean>;
      openLogin: () => Promise<boolean>;
    };
  }
}

const hotkeyDisplay = document.getElementById('hotkey-display') as HTMLElement;
const hotkeyBtn = document.getElementById('hotkey-remap') as HTMLButtonElement;
const micSel = document.getElementById('mic') as HTMLSelectElement;
const tgStatus = document.getElementById('tg-status') as HTMLElement;
const tgLogin = document.getElementById('tg-login') as HTMLButtonElement;
const tgLogout = document.getElementById('tg-logout') as HTMLButtonElement;
const msgEl = document.getElementById('msg') as HTMLElement;

function setMsg(m: string) { msgEl.textContent = m; }

function fmtCombo(c: string[]): string {
  return c.length ? c.join(' + ') : '—';
}

async function refresh() {
  const s = await window.settingsAPI.get();
  hotkeyDisplay.textContent = fmtCombo(s.hotkey);
  tgStatus.textContent = s.loggedIn ? 'Signed in' : 'Not signed in';
  tgLogin.disabled = s.loggedIn;
  tgLogout.disabled = !s.loggedIn;
  await populateMics(s.micDeviceId);
}

async function populateMics(selected: string) {
  // Ask the user once if needed — this prompt is just so enumerateDevices gives us labels.
  try { await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())); } catch { /* ignore */ }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter(d => d.kind === 'audioinput');
  micSel.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'System default';
  micSel.appendChild(def);
  for (const d of mics) {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 6)})`;
    micSel.appendChild(opt);
  }
  micSel.value = selected;
}

hotkeyBtn.addEventListener('click', async () => {
  hotkeyBtn.disabled = true;
  hotkeyDisplay.textContent = 'Press the new combo…';
  setMsg('');
  const r = await window.settingsAPI.captureHotkey();
  hotkeyBtn.disabled = false;
  if (r.ok && r.combo) {
    hotkeyDisplay.textContent = fmtCombo(r.combo);
    setMsg('Hotkey updated.');
  } else {
    setMsg(r.error || 'Capture failed.');
    await refresh();
  }
});

micSel.addEventListener('change', async () => {
  await window.settingsAPI.set({ micDeviceId: micSel.value });
  setMsg('Microphone saved.');
});

tgLogin.addEventListener('click', async () => {
  tgLogin.disabled = true;
  setMsg('Opening sign-in…');
  await window.settingsAPI.openLogin();
  await refresh();
});

tgLogout.addEventListener('click', async () => {
  tgLogout.disabled = true;
  setMsg('Logging out…');
  await window.settingsAPI.logout();
  setMsg('Logged out.');
  await refresh();
});

refresh();
