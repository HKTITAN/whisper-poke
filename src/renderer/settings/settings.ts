declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<{ hotkey: string[]; micDeviceId: string; loggedIn: boolean; version: string }>;
      set: (p: Record<string, unknown>) => Promise<unknown>;
      captureHotkey: () => Promise<{ ok: boolean; combo?: string[]; error?: string }>;
      logout: () => Promise<boolean>;
      openLogin: () => Promise<boolean>;
      getTgUser: () => Promise<{ name: string; username?: string; phone?: string } | null>;
      openExternal: (url: string) => void;
    };
  }
}

// ---- tab switching --------------------------------------------------------
document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab!;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll<HTMLElement>('.pane').forEach((p) => {
      p.classList.toggle('active', p.dataset.pane === tab);
    });
  });
});

// ---- element refs ---------------------------------------------------------
const hotkeyDisplay = document.getElementById('hotkey-display') as HTMLElement;
const hotkeyBtn = document.getElementById('hotkey-remap') as HTMLButtonElement;
const micSel = document.getElementById('mic') as HTMLSelectElement;
const msgEl = document.getElementById('msg') as HTMLElement;

const accountRow = document.getElementById('account-row') as HTMLDivElement;
const tgStatus = document.getElementById('tg-status') as HTMLElement;
const tgName = document.getElementById('tg-name') as HTMLElement;
const tgSub = document.getElementById('tg-sub') as HTMLElement;
const tgAvatar = document.getElementById('account-avatar') as HTMLElement;
const tgLogin = document.getElementById('tg-login') as HTMLButtonElement;
const tgLogout = document.getElementById('tg-logout') as HTMLButtonElement;

const brandVersion = document.getElementById('brand-version') as HTMLElement;
const aboutVersion = document.getElementById('about-version') as HTMLElement;
const linkKhe = document.getElementById('link-khe') as HTMLAnchorElement;

// ---- helpers --------------------------------------------------------------
function setMsg(m: string) { msgEl.textContent = m; }

function fmtCombo(c: string[]): string {
  return c.length ? c.join(' + ') : '—';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

async function refreshAccount(loggedIn: boolean) {
  if (!loggedIn) {
    accountRow.classList.add('signed-out');
    tgStatus.textContent = 'Not signed in';
    tgName.textContent = '';
    tgSub.textContent = '';
    tgAvatar.textContent = '?';
    tgLogin.disabled = false;
    tgLogout.disabled = true;
    return;
  }

  tgLogin.disabled = true;
  tgLogout.disabled = false;
  accountRow.classList.remove('signed-out');
  tgStatus.textContent = 'Signed in';

  const user = await window.settingsAPI.getTgUser();
  if (user) {
    tgName.textContent = user.name;
    const bits: string[] = [];
    if (user.username) bits.push('@' + user.username);
    if (user.phone) bits.push('+' + user.phone);
    tgSub.textContent = bits.join(' · ');
    tgAvatar.textContent = initials(user.name);
  } else {
    tgName.textContent = 'Telegram user';
    tgSub.textContent = '';
    tgAvatar.textContent = '?';
  }
}

async function refresh() {
  const s = await window.settingsAPI.get();
  hotkeyDisplay.textContent = fmtCombo(s.hotkey);
  brandVersion.textContent = 'v' + s.version;
  aboutVersion.textContent = 'v' + s.version;
  await refreshAccount(s.loggedIn);
  await populateMics(s.micDeviceId);
}

async function populateMics(selected: string) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch { /* labels just won't be populated — fine */ }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === 'audioinput');
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

// ---- event wiring ---------------------------------------------------------
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
  tgStatus.textContent = 'Opening sign-in…';
  await window.settingsAPI.openLogin();
  await refresh();
});

tgLogout.addEventListener('click', async () => {
  tgLogout.disabled = true;
  tgStatus.textContent = 'Logging out…';
  await window.settingsAPI.logout();
  await refresh();
});

linkKhe.addEventListener('click', (e) => {
  e.preventDefault();
  window.settingsAPI.openExternal('https://www.khe.money');
});

refresh();
