type HotkeySlot = 'hold' | 'toggle' | 'quicksend' | 'screenHold' | 'screenToggle';

declare global {
  interface Window {
    settingsAPI: {
      get: () => Promise<{
        hotkey: string[];
        toggleHotkey: string[];
        quickSendHotkey: string[];
        screenHoldHotkey: string[];
        screenToggleHotkey: string[];
        micDeviceId: string;
        loggedIn: boolean;
        showTranscript: boolean;
        sendTranscript: boolean;
        version: string;
      }>;
      set: (p: Record<string, unknown>) => Promise<unknown>;
      captureHotkey: (which: HotkeySlot) => Promise<{ ok: boolean; combo?: string[]; error?: string }>;
      captureHotkeyLive: (which: HotkeySlot) => Promise<{ ok: boolean; combo?: string[]; error?: string }>;
      captureHotkeyCancel: () => Promise<boolean>;
      onCaptureHotkeyProgress: (cb: (keys: string[]) => void) => void;
      logout: () => Promise<boolean>;
      openLogin: () => Promise<boolean>;
      openMicTest: () => Promise<boolean>;
      getTgUser: () => Promise<{
        id?: string;
        name: string;
        username?: string;
        phone?: string;
        premium?: boolean;
      } | null>;
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
const toggleDisplay = document.getElementById('toggle-display') as HTMLElement;
const quicksendDisplay = document.getElementById('quicksend-display') as HTMLElement;
const screenHoldDisplay = document.getElementById('screen-hold-display') as HTMLElement;
const screenToggleDisplay = document.getElementById('screen-toggle-display') as HTMLElement;
const micSel = document.getElementById('mic') as HTMLSelectElement;
const msgEl = document.getElementById('msg') as HTMLElement;
const micTestBtn = document.getElementById('mic-test-btn') as HTMLButtonElement;
const showTranscriptToggle = document.getElementById('toggle-show-transcript') as HTMLInputElement;
const sendTranscriptToggle = document.getElementById('toggle-send-transcript') as HTMLInputElement;

const accountRow = document.getElementById('account-row') as HTMLDivElement;
const tgStatus = document.getElementById('tg-status') as HTMLElement;
const tgName = document.getElementById('tg-name') as HTMLElement;
const tgSub = document.getElementById('tg-sub') as HTMLElement;
const tgAvatar = document.getElementById('account-avatar') as HTMLElement;
const tgLogin = document.getElementById('tg-login') as HTMLButtonElement;
const tgLogout = document.getElementById('tg-logout') as HTMLButtonElement;
const tgPremium = document.getElementById('tg-premium') as HTMLElement;
const tgDetails = document.getElementById('account-details') as HTMLElement;
const tgId = document.getElementById('tg-id') as HTMLElement;
const tgUsername = document.getElementById('tg-username') as HTMLElement;
const tgPhone = document.getElementById('tg-phone') as HTMLElement;

const signedChip = document.getElementById('signed-chip') as HTMLElement;
const signedChipAvatar = document.getElementById('signed-chip-avatar') as HTMLElement;
const signedChipName = document.getElementById('signed-chip-name') as HTMLElement;
const signedChipPremium = document.getElementById('signed-chip-premium') as HTMLElement;

const brandVersion = document.getElementById('brand-version') as HTMLElement;
const aboutVersion = document.getElementById('about-version') as HTMLElement;
const linkKhe = document.getElementById('link-khe') as HTMLAnchorElement;

const kbdModal = document.getElementById('kbd-modal') as HTMLDivElement;
const kbdTitle = document.getElementById('kbd-title') as HTMLElement;
const kbdPreviewCombo = document.getElementById('kbd-preview-combo') as HTMLElement;
const kbdCancelBtn = document.getElementById('kbd-cancel') as HTMLButtonElement;
const virtualKeyboardEl = document.getElementById('virtual-keyboard') as HTMLElement;

// ---- helpers --------------------------------------------------------------
function setMsg(m: string) { msgEl.textContent = m; }

function fmtCombo(c: string[]): string {
  return c.length ? c.join(' + ') : '—';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// ---- virtual keyboard -----------------------------------------------------
// Inspired by https://keyb.vercel.app — a simple visual keyboard that lights
// up whichever keys the user is currently pressing during hotkey remap.
//
// Each row is an array of { label, name?, cls? }.
//   label — shown on the key
//   name  — the canonical HotkeyManager name (matches MODIFIER_GROUPS / SINGLE_KEYS)
//   cls   — additional class (wide / xwide / space)
interface VKey { label: string; name?: string; cls?: string; }

const keyboardRows: VKey[][] = [
  [
    { label: 'Esc', name: 'Escape' },
    { label: 'F1',  name: 'F1' }, { label: 'F2', name: 'F2' }, { label: 'F3', name: 'F3' }, { label: 'F4', name: 'F4' },
    { label: 'F5',  name: 'F5' }, { label: 'F6', name: 'F6' }, { label: 'F7', name: 'F7' }, { label: 'F8', name: 'F8' },
    { label: 'F9',  name: 'F9' }, { label: 'F10', name: 'F10' }, { label: 'F11', name: 'F11' }, { label: 'F12', name: 'F12' },
  ],
  [
    { label: '`' }, { label: '1' }, { label: '2' }, { label: '3' }, { label: '4' }, { label: '5' },
    { label: '6' }, { label: '7' }, { label: '8' }, { label: '9' }, { label: '0' }, { label: '-' }, { label: '=' },
    { label: 'Backspace', cls: 'xwide' },
  ],
  [
    { label: 'Tab', name: 'Tab', cls: 'wide' },
    { label: 'Q' }, { label: 'W' }, { label: 'E' }, { label: 'R' }, { label: 'T' },
    { label: 'Y' }, { label: 'U' }, { label: 'I' }, { label: 'O' }, { label: 'P' },
    { label: '[' }, { label: ']' }, { label: '\\' },
  ],
  [
    { label: 'Caps', cls: 'wide' },
    { label: 'A' }, { label: 'S' }, { label: 'D' }, { label: 'F' }, { label: 'G' },
    { label: 'H' }, { label: 'J' }, { label: 'K' }, { label: 'L' },
    { label: ';' }, { label: "'" },
    { label: 'Enter', name: 'Enter', cls: 'xwide' },
  ],
  [
    { label: 'Shift', name: 'Shift', cls: 'xwide' },
    { label: 'Z' }, { label: 'X' }, { label: 'C' }, { label: 'V' }, { label: 'B' },
    { label: 'N' }, { label: 'M' },
    { label: ',' }, { label: '.' }, { label: '/' },
    { label: 'Shift', name: 'Shift', cls: 'xwide' },
  ],
  [
    { label: 'Ctrl', name: 'Ctrl', cls: 'wide' },
    { label: 'Win', name: 'Meta', cls: 'wide' },
    { label: 'Alt', name: 'Alt', cls: 'wide' },
    { label: '', name: 'Space', cls: 'space' },
    { label: 'Alt', name: 'Alt', cls: 'wide' },
    { label: 'Win', name: 'Meta', cls: 'wide' },
    { label: 'Ctrl', name: 'Ctrl', cls: 'wide' },
  ],
];

function renderKeyboard() {
  virtualKeyboardEl.innerHTML = '';
  for (const row of keyboardRows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'vk-row';
    for (const key of row) {
      const el = document.createElement('div');
      el.className = 'vk-key' + (key.cls ? ' ' + key.cls : '');
      el.textContent = key.label;
      if (key.name) el.dataset.name = key.name;
      rowEl.appendChild(el);
    }
    virtualKeyboardEl.appendChild(rowEl);
  }
}

function updateKeyboardActive(names: string[]) {
  const nameSet = new Set(names);
  virtualKeyboardEl.querySelectorAll<HTMLElement>('.vk-key').forEach((el) => {
    const n = el.dataset.name;
    el.classList.toggle('active', !!n && nameSet.has(n));
  });
  kbdPreviewCombo.textContent = names.length ? names.join(' + ') : '—';
}

// ---- account / transcript refresh -----------------------------------------
async function refreshAccount(loggedIn: boolean) {
  if (!loggedIn) {
    accountRow.classList.add('signed-out');
    tgStatus.textContent = 'Not signed in';
    tgName.textContent = '';
    tgSub.textContent = '';
    tgAvatar.textContent = '?';
    tgPremium.hidden = true;
    tgDetails.hidden = true;
    tgLogin.disabled = false;
    tgLogout.disabled = true;
    signedChip.hidden = true;
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
    tgPremium.hidden = !user.premium;

    tgDetails.hidden = false;
    tgId.textContent = user.id || '—';
    tgUsername.textContent = user.username ? '@' + user.username : '—';
    tgPhone.textContent = user.phone ? '+' + user.phone : '—';

    const chipLabel = user.username ? '@' + user.username : user.name;
    signedChipName.textContent = chipLabel;
    signedChipAvatar.textContent = initials(user.name);
    signedChipPremium.hidden = !user.premium;
    signedChip.hidden = false;
  } else {
    tgName.textContent = 'Telegram user';
    tgSub.textContent = '';
    tgAvatar.textContent = '?';
    tgPremium.hidden = true;
    tgDetails.hidden = true;
    signedChip.hidden = true;
  }
}

async function refresh() {
  const s = await window.settingsAPI.get();
  hotkeyDisplay.textContent = fmtCombo(s.hotkey);
  toggleDisplay.textContent = fmtCombo(s.toggleHotkey);
  quicksendDisplay.textContent = fmtCombo(s.quickSendHotkey);
  screenHoldDisplay.textContent = fmtCombo(s.screenHoldHotkey);
  screenToggleDisplay.textContent = fmtCombo(s.screenToggleHotkey);
  brandVersion.textContent = 'v' + s.version;
  aboutVersion.textContent = 'v' + s.version;
  showTranscriptToggle.checked = s.showTranscript;
  sendTranscriptToggle.checked = s.sendTranscript;
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

// ---- hotkey remap flow ----------------------------------------------------
let captureActive = false;

window.settingsAPI.onCaptureHotkeyProgress((keys) => {
  if (captureActive) updateKeyboardActive(keys);
});

const SLOT_META: Record<HotkeySlot, { title: string; label: string; display: HTMLElement }> = {
  hold:         { title: 'Press your new hold-to-talk hotkey…', label: 'Hold',         display: hotkeyDisplay },
  toggle:       { title: 'Press your new toggle hotkey…',       label: 'Toggle',       display: toggleDisplay },
  quicksend:    { title: 'Press your new quick-send hotkey…',   label: 'Quick-send',   display: quicksendDisplay },
  screenHold:   { title: 'Press your new screen hold hotkey…',  label: 'Screen hold',  display: screenHoldDisplay },
  screenToggle: { title: 'Press your new screen toggle hotkey…',label: 'Screen toggle',display: screenToggleDisplay },
};

async function beginCapture(which: HotkeySlot) {
  if (captureActive) return;
  const meta = SLOT_META[which];
  if (!meta) return;
  captureActive = true;
  updateKeyboardActive([]);
  kbdTitle.textContent = meta.title;
  kbdModal.hidden = false;

  try {
    const r = await window.settingsAPI.captureHotkeyLive(which);
    if (r.ok && r.combo) {
      setMsg(`${meta.label} hotkey updated.`);
      meta.display.textContent = fmtCombo(r.combo);
      // Brief flash on the final combo.
      updateKeyboardActive(r.combo);
      await new Promise((res) => setTimeout(res, 420));
    } else if (r.error) {
      setMsg(r.error);
    }
  } finally {
    captureActive = false;
    kbdModal.hidden = true;
    await refresh();
  }
}

kbdCancelBtn.addEventListener('click', async () => {
  await window.settingsAPI.captureHotkeyCancel();
});

kbdModal.addEventListener('click', async (e) => {
  if (e.target === kbdModal) {
    await window.settingsAPI.captureHotkeyCancel();
  }
});

// ---- event wiring ---------------------------------------------------------
document.querySelectorAll<HTMLButtonElement>('[data-remap]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const which = (btn.dataset.remap as HotkeySlot) || 'hold';
    void beginCapture(which);
  });
});

micSel.addEventListener('change', async () => {
  await window.settingsAPI.set({ micDeviceId: micSel.value });
  setMsg('Microphone saved.');
});

micTestBtn.addEventListener('click', async () => {
  await window.settingsAPI.openMicTest();
});

showTranscriptToggle.addEventListener('change', async () => {
  await window.settingsAPI.set({ showTranscript: showTranscriptToggle.checked });
  setMsg(showTranscriptToggle.checked ? 'Live transcript on.' : 'Live transcript off.');
});

sendTranscriptToggle.addEventListener('change', async () => {
  await window.settingsAPI.set({ sendTranscript: sendTranscriptToggle.checked });
  setMsg(sendTranscriptToggle.checked ? 'Transcript will be sent with voice.' : 'Transcript will not be sent.');
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

renderKeyboard();
refresh();
