import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from project root before anything else imports env-dependent modules.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog } from 'electron';
import { telegram } from './telegram';
import { HotkeyManager, captureCombo } from './hotkey';
import { PTTStateMachine } from './state-machine';
import { getSettings, setSettings } from './settings-store';
import { createOverlayWindow, createSettingsWindow, createLoginWindow } from './windows';
import { IPC } from './ipc-channels';
import { buildTrayIcon } from './tray-icon';

const MIN_DURATION_SEC = 1.0;
const OVERLAY_LINGER_MS = 650;

let overlayWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let loginWin: BrowserWindow | null = null;
let tray: Tray | null = null;

const hotkeys = new HotkeyManager();
const ptt = new PTTStateMachine();

function showOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) {
    overlayWin = createOverlayWindow();
  }
  overlayWin.showInactive();
}

function hideOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = createSettingsWindow();
  settingsWin.on('closed', () => { settingsWin = null; });
}

function openLogin(): Promise<void> {
  return new Promise((resolve) => {
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.focus();
      loginWin.once('closed', () => resolve());
      return;
    }
    loginWin = createLoginWindow();
    loginWin.on('closed', () => {
      loginWin = null;
      resolve();
    });
  });
}

function buildTray() {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('WhisperPoke — hold your hotkey to record');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `WhisperPoke v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Settings…', click: () => openSettings() },
    { label: 'About / khe.money', click: () => shell.openExternal('https://www.khe.money') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', () => openSettings());
}

// ---- PTT wiring -------------------------------------------------------------

hotkeys.on('press', () => ptt.press());
hotkeys.on('release', () => ptt.release());
hotkeys.on('cancel', () => ptt.cancel());

ptt.on('change', ({ next }) => {
  switch (next) {
    case 'Recording':
      showOverlay();
      overlayWin?.webContents.send(IPC.OverlayStart);
      break;
    case 'Canceling':
      overlayWin?.webContents.send(IPC.OverlayCancel);
      break;
    case 'Sending':
      overlayWin?.webContents.send(IPC.OverlayStop);
      break;
    case 'Idle':
      hideOverlay();
      break;
  }
});

// Overlay → main: audio produced (release) or discarded (cancel).
ipcMain.on(IPC.OverlayRecorded, async (_e, payload: { bytes: ArrayBuffer; durationSec: number }) => {
  const buf = Buffer.from(payload.bytes);

  // Guardrail: ignore accidental taps. The overlay shows a "too short" flash
  // and dismisses itself; we don't spam Poke with blank fragments.
  if (buf.length === 0 || payload.durationSec < MIN_DURATION_SEC) {
    overlayWin?.webContents.send(IPC.OverlayTooShort);
    setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
    return;
  }

  try {
    await telegram.sendVoiceNote(buf, payload.durationSec);
    overlayWin?.webContents.send(IPC.OverlaySent);
    setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
  } catch (err) {
    console.error('[main] sendVoiceNote failed:', err);
    overlayWin?.webContents.send(IPC.OverlaySendFailed, (err as Error).message);
    setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
    dialog.showErrorBox('WhisperPoke', `Failed to send voice note: ${(err as Error).message}`);
  }
});

ipcMain.on(IPC.OverlayDiscarded, () => {
  setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
});

ipcMain.on(IPC.OverlayError, (_e, msg: string) => {
  console.error('[overlay]', msg);
  ptt.finished();
});

ipcMain.handle(IPC.OverlayGetMicId, () => getSettings().micDeviceId);

// ---- Settings IPC -----------------------------------------------------------

ipcMain.handle(IPC.SettingsGet, () => ({
  ...getSettings(),
  version: app.getVersion(),
}));

ipcMain.handle(IPC.SettingsGetTgUser, async () => {
  if (!telegram.isReady) return null;
  return telegram.getUserInfo();
});

ipcMain.handle(IPC.SettingsSet, (_e, patch) => {
  setSettings(patch);
  return getSettings();
});

ipcMain.handle(IPC.SettingsCaptureHotkey, async () => {
  try {
    const combo = await captureCombo();
    setSettings({ hotkey: combo });
    return { ok: true, combo };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

ipcMain.handle(IPC.SettingsLogout, async () => {
  await telegram.logout();
  setSettings({ loggedIn: false });
  return true;
});

ipcMain.handle(IPC.SettingsOpenLogin, async () => {
  await openLogin();
  return getSettings().loggedIn;
});

// ---- Login IPC --------------------------------------------------------------
// The login flow uses paired "provide/submit" channels: main asks the window
// for input (phone/code/password) via LoginProvide*, the renderer posts back
// via LoginSubmit with {kind, value}. This keeps gramjs's async callbacks
// decoupled from the renderer's UI.

type Pending = { resolve: (v: string) => void; reject: (e: Error) => void };
const pending: Partial<Record<'phone' | 'code' | 'password', Pending>> = {};

function ask(kind: 'phone' | 'code' | 'password'): Promise<string> {
  return new Promise((resolve, reject) => {
    pending[kind] = { resolve, reject };
    const channel = kind === 'phone'
      ? IPC.LoginProvidePhone
      : kind === 'code'
        ? IPC.LoginProvideCode
        : IPC.LoginProvidePassword;
    loginWin?.webContents.send(channel);
  });
}

ipcMain.on(IPC.LoginSubmit, (_e, payload: { kind: 'phone' | 'code' | 'password'; value: string }) => {
  const p = pending[payload.kind];
  if (p) {
    delete pending[payload.kind];
    p.resolve(payload.value);
  }
});

ipcMain.handle(IPC.LoginStart, async () => {
  try {
    await telegram.login({
      phone: () => ask('phone'),
      code: () => ask('code'),
      password: () => ask('password'),
      onError: (err) => {
        loginWin?.webContents.send(IPC.LoginStatus, `Error: ${err.message}`);
      },
    });
    setSettings({ loggedIn: true });
    loginWin?.webContents.send(IPC.LoginDone, { ok: true });
    return { ok: true };
  } catch (err) {
    loginWin?.webContents.send(IPC.LoginDone, { ok: false, error: (err as Error).message });
    return { ok: false, error: (err as Error).message };
  }
});

// ---- App lifecycle ----------------------------------------------------------

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
}

app.whenReady().then(async () => {
  buildTray();

  // Create overlay up front so the first press has no cold-start lag.
  overlayWin = createOverlayWindow();

  const ok = await telegram.init();
  if (!ok) {
    await openLogin();
  }

  hotkeys.start();

  if (process.argv.includes('--settings')) openSettings();
});

app.on('window-all-closed', () => {
  // No-op: keep running in tray. (Don't call app.quit().)
});

app.on('before-quit', () => {
  hotkeys.stop();
});
