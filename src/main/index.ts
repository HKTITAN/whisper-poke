import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from project root before anything else imports env-dependent modules.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog, session, desktopCapturer } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as pathMod from 'path';
import { telegram } from './telegram';
import { HotkeyManager, captureCombo, startLiveCapture } from './hotkey';
import { PTTStateMachine } from './state-machine';
import { getSettings, setSettings } from './settings-store';
import {
  createOverlayWindow,
  createSettingsWindow,
  createLoginWindow,
  createMicTestWindow,
  createQuickSendWindow,
} from './windows';
import { IPC } from './ipc-channels';
import { buildTrayIconIdle, buildTrayIconRecording } from './tray-icon';

const MIN_DURATION_SEC = 1.0;
const OVERLAY_LINGER_MS = 650;

let overlayWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let loginWin: BrowserWindow | null = null;
let micTestWin: BrowserWindow | null = null;
let quickSendWin: BrowserWindow | null = null;
let tray: Tray | null = null;

const hotkeys = new HotkeyManager();
const ptt = new PTTStateMachine();

// Transcript captured by the overlay for the currently-in-flight recording.
let pendingTranscript = '';

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

function openQuickSend() {
  const showAndReset = () => {
    if (!quickSendWin || quickSendWin.isDestroyed()) return;
    quickSendWin.show();
    // Ensure the window can receive keystrokes immediately.
    quickSendWin.focus();
    quickSendWin.moveTop();
    quickSendWin.webContents.send(IPC.QuickSendReset);
  };
  if (quickSendWin && !quickSendWin.isDestroyed()) {
    showAndReset();
    return;
  }
  quickSendWin = createQuickSendWindow();
  quickSendWin.once('ready-to-show', showAndReset);
  quickSendWin.on('closed', () => { quickSendWin = null; });
  quickSendWin.on('blur', () => {
    // Hide on blur so the next Ctrl+Space re-focuses cleanly. Keep the window
    // around so IPC senders stay stable during submit.
    if (quickSendWin && !quickSendWin.isDestroyed()) quickSendWin.hide();
  });
}

function openMicTest() {
  if (micTestWin && !micTestWin.isDestroyed()) {
    micTestWin.focus();
    return;
  }
  micTestWin = createMicTestWindow();
  micTestWin.on('closed', () => { micTestWin = null; });
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

function fmtCombo(keys: string[]): string {
  return keys.length ? keys.join('+') : '—';
}

function buildTrayMenu() {
  if (!tray) return;
  const s = getSettings();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `WhisperPoke v${app.getVersion()}`, enabled: false },
    { label: ptt.state === 'Recording' ? '● Recording' : '○ Idle', enabled: false },
    { type: 'separator' },
    { label: `Hold: ${fmtCombo(s.hotkey)}`, enabled: false },
    { label: `Toggle: ${fmtCombo(s.toggleHotkey)}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Show live transcript',
      type: 'checkbox',
      checked: s.showTranscript,
      click: (item) => { setSettings({ showTranscript: item.checked }); buildTrayMenu(); },
    },
    {
      label: 'Send transcript with voice',
      type: 'checkbox',
      checked: s.sendTranscript,
      click: (item) => { setSettings({ sendTranscript: item.checked }); buildTrayMenu(); },
    },
    { type: 'separator' },
    { label: 'Test microphone…', click: () => openMicTest() },
    { label: 'Settings…', click: () => openSettings() },
    { label: 'About / khe.money', click: () => shell.openExternal('https://www.khe.money') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function setTrayRecording(recording: boolean) {
  if (!tray) return;
  tray.setImage(recording ? buildTrayIconRecording() : buildTrayIconIdle());
  tray.setToolTip(recording
    ? 'WhisperPoke — recording (press Esc to cancel)'
    : 'WhisperPoke — hold your hotkey to record');
  buildTrayMenu();
}

function buildTray() {
  tray = new Tray(buildTrayIconIdle());
  tray.setToolTip('WhisperPoke — hold your hotkey to record');
  buildTrayMenu();
  tray.on('click', () => openSettings());
}

// ---- PTT wiring -------------------------------------------------------------

hotkeys.on('press', (ev: { kind: 'voice' | 'screen' }) => ptt.press('hold', ev.kind));
hotkeys.on('release', () => ptt.release());
hotkeys.on('toggle', (ev: { kind: 'voice' | 'screen' }) => {
  if (ptt.state === 'Idle') ptt.press('toggle', ev.kind);
  else if (ptt.state === 'Recording' && ptt.mode === 'toggle' && ptt.kind === ev.kind) ptt.toggle();
});
hotkeys.on('cancel', () => ptt.cancel());
hotkeys.on('lock', () => ptt.lock());
hotkeys.on('quicksend', () => openQuickSend());

ptt.on('mode-change', ({ mode, kind }) => {
  // Notify overlay that a hold session was promoted to lock/toggle mode.
  overlayWin?.webContents.send(IPC.OverlayModeChange, { mode, kind });
});

ptt.on('change', ({ next, mode, kind }) => {
  switch (next) {
    case 'Recording': {
      showOverlay();
      const s = getSettings();
      overlayWin?.webContents.send(IPC.OverlayStart, {
        mode,
        kind,
        showTranscript: s.showTranscript && kind === 'voice',
      });
      setTrayRecording(true);
      break;
    }
    case 'Canceling':
      overlayWin?.webContents.send(IPC.OverlayCancel);
      hotkeys.armIdle();
      setTrayRecording(false);
      break;
    case 'Sending':
      overlayWin?.webContents.send(IPC.OverlayStop);
      hotkeys.armIdle();
      setTrayRecording(false);
      break;
    case 'Idle':
      hideOverlay();
      // Pass-through always on when idle.
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.setIgnoreMouseEvents(true, { forward: true });
      }
      setTrayRecording(false);
      break;
  }
});

// Overlay → main: audio produced (release) or discarded (cancel).
ipcMain.on(
  IPC.OverlayRecorded,
  async (_e, payload: {
    bytes: ArrayBuffer;
    durationSec: number;
    transcript: string;
    kind?: 'voice' | 'screen';
    mime?: string;
  }) => {
    const buf = Buffer.from(payload.bytes);
    pendingTranscript = (payload.transcript || '').trim();
    const kind = payload.kind || 'voice';

    if (buf.length === 0 || payload.durationSec < MIN_DURATION_SEC) {
      overlayWin?.webContents.send(IPC.OverlayTooShort);
      setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
      return;
    }

    try {
      if (kind === 'screen') {
        const ext = (payload.mime || '').includes('mp4') ? 'mp4' : 'webm';
        await telegram.sendVideo(buf, payload.durationSec, undefined, `screen.${ext}`);
      } else {
        await telegram.sendVoiceNote(buf, payload.durationSec);

        const settings = getSettings();
        if (settings.sendTranscript && pendingTranscript.length > 0) {
          try {
            await telegram.sendText(
              `📝 Rough transcript of my dictation:\n\n${pendingTranscript}`,
            );
          } catch (err) {
            console.warn('[main] sendText (transcript) failed:', err);
          }
        }
      }

      overlayWin?.webContents.send(IPC.OverlaySent);
      setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
    } catch (err) {
      console.error('[main] send failed:', err);
      overlayWin?.webContents.send(IPC.OverlaySendFailed, (err as Error).message);
      setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
      dialog.showErrorBox('WhisperPoke', `Failed to send: ${(err as Error).message}`);
    } finally {
      pendingTranscript = '';
    }
  },
);

ipcMain.on(IPC.OverlayDiscarded, () => {
  setTimeout(() => ptt.finished(), OVERLAY_LINGER_MS);
});

ipcMain.on(IPC.OverlayError, (_e, msg: string) => {
  console.error('[overlay]', msg);
  ptt.finished();
});

ipcMain.on(IPC.OverlayCommit, () => {
  if (ptt.state === 'Recording') ptt.commit();
});

ipcMain.on(IPC.OverlayRequestCancel, () => {
  if (ptt.state === 'Recording') ptt.cancel();
});

ipcMain.on(IPC.OverlaySetMouseThrough, (_e, through: boolean) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setIgnoreMouseEvents(through, { forward: true });
});

ipcMain.handle(IPC.OverlayGetMicId, () => getSettings().micDeviceId);
ipcMain.handle(IPC.MicTestGetMicId, () => getSettings().micDeviceId);
ipcMain.handle(IPC.QuickSendGetMicId, () => getSettings().micDeviceId);

// ---- Quick-send IPC ---------------------------------------------------------

ipcMain.on(IPC.QuickSendClose, () => {
  if (quickSendWin && !quickSendWin.isDestroyed()) quickSendWin.hide();
});

ipcMain.handle(IPC.QuickSendPickFiles, async () => {
  if (!quickSendWin || quickSendWin.isDestroyed()) return [];
  const r = await dialog.showOpenDialog(quickSendWin, {
    title: 'Attach files to Poke',
    properties: ['openFile', 'multiSelections'],
  });
  if (r.canceled) return [];
  return r.filePaths.map((p) => {
    let size = 0;
    try { size = fs.statSync(p).size; } catch { /* ignore */ }
    return { path: p, name: pathMod.basename(p), size };
  });
});

interface QSSubmit {
  text: string;
  voice?: { bytes: ArrayBuffer; durationSec: number };
  video?: { bytes: ArrayBuffer; durationSec: number; mime: string };
  files: { path: string; name: string; size: number }[];
}

ipcMain.on(IPC.QuickSendSubmit, async (_e, p: QSSubmit) => {
  const sendStatus = (m: string) => {
    if (quickSendWin && !quickSendWin.isDestroyed()) {
      quickSendWin.webContents.send(IPC.QuickSendStatus, m);
    }
  };
  try {
    if (p.voice && p.voice.bytes) {
      sendStatus('Sending voice note…');
      await telegram.sendVoiceNote(Buffer.from(p.voice.bytes), p.voice.durationSec);
    }
    for (let i = 0; i < p.files.length; i++) {
      const f = p.files[i];
      sendStatus(`Sending file ${i + 1}/${p.files.length}: ${f.name}`);
      const isLast = i === p.files.length - 1 && !p.video && !p.text;
      await telegram.sendFileAttachment({ path: f.path, name: f.name }, isLast ? p.text : undefined);
    }
    if (p.video && p.video.bytes) {
      sendStatus('Sending video…');
      const caption = !p.text ? undefined : p.text;
      const ext = (p.video.mime || '').includes('mp4') ? 'mp4' : 'webm';
      await telegram.sendVideo(
        Buffer.from(p.video.bytes),
        p.video.durationSec,
        caption,
        `snippet.${ext}`,
      );
    }
    // If text hasn't already been attached as caption of last file/video,
    // send it as a standalone message.
    const textAttached = (p.files.length > 0 && !p.video) || !!p.video;
    if (p.text && !textAttached) {
      sendStatus('Sending message…');
      await telegram.sendText(p.text);
    }
    if (quickSendWin && !quickSendWin.isDestroyed()) {
      quickSendWin.webContents.send(IPC.QuickSendSent);
    }
  } catch (err) {
    console.error('[main] quicksend failed:', err);
    if (quickSendWin && !quickSendWin.isDestroyed()) {
      quickSendWin.webContents.send(IPC.QuickSendFailed, (err as Error).message);
    }
  }
});

// ---- Settings IPC -----------------------------------------------------------

ipcMain.handle(IPC.SettingsGet, () => ({
  ...getSettings(),
  version: app.getVersion(),
  platform: process.platform,
  device: os.hostname(),
}));

ipcMain.handle(IPC.SettingsGetTgUser, async () => {
  if (!telegram.isReady) return null;
  return telegram.getUserInfo();
});

ipcMain.handle(IPC.SettingsSet, (_e, patch) => {
  setSettings(patch);
  buildTrayMenu();
  return getSettings();
});

type HotkeySlot = 'hold' | 'toggle' | 'quicksend' | 'screenHold' | 'screenToggle';

function patchForSlot(which: HotkeySlot, combo: string[]): Record<string, string[]> {
  switch (which) {
    case 'toggle':       return { toggleHotkey: combo };
    case 'quicksend':    return { quickSendHotkey: combo };
    case 'screenHold':   return { screenHoldHotkey: combo };
    case 'screenToggle': return { screenToggleHotkey: combo };
    default:             return { hotkey: combo };
  }
}

ipcMain.handle(IPC.SettingsCaptureHotkey, async (_e, which: HotkeySlot = 'hold') => {
  try {
    const combo = await captureCombo();
    setSettings(patchForSlot(which, combo));
    buildTrayMenu();
    return { ok: true, combo };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// Live capture — settings UI shows the keyboard lighting up while the user
// presses keys. Returns an id so the renderer can cancel.
let liveCancel: (() => void) | null = null;
ipcMain.handle(IPC.SettingsCaptureHotkeyLive, async (e, which: HotkeySlot = 'hold') => {
  return new Promise<{ ok: boolean; combo?: string[]; error?: string }>((resolve) => {
    if (liveCancel) { liveCancel(); liveCancel = null; }

    // Pause normal hotkey handling so holding Ctrl+Meta during capture
    // doesn't simultaneously fire a recording. Also focus-lock the
    // settings window so stray keys can't hit other apps.
    hotkeys.pause();
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.setAlwaysOnTop(true, 'screen-saver');
      settingsWin.focus();
    }

    const done = (result: { ok: boolean; combo?: string[]; error?: string }) => {
      hotkeys.resume();
      if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.setAlwaysOnTop(false);
      }
      resolve(result);
    };

    liveCancel = startLiveCapture(
      (keys) => {
        e.sender.send(IPC.SettingsCaptureHotkeyProgress, keys);
      },
      (combo) => {
        liveCancel = null;
        setSettings(patchForSlot(which, combo));
        buildTrayMenu();
        done({ ok: true, combo });
      },
      (err) => {
        liveCancel = null;
        done({ ok: false, error: err.message });
      },
    );
  });
});

ipcMain.handle(IPC.SettingsCaptureHotkeyCancel, () => {
  if (liveCancel) { liveCancel(); liveCancel = null; }
  return true;
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

ipcMain.handle(IPC.SettingsOpenMicTest, () => {
  openMicTest();
  return true;
});

// ---- Login IPC --------------------------------------------------------------
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
  // Enable getDisplayMedia() in renderers — picks the primary screen and
  // pairs it with system loopback audio (Windows). No native picker UI.
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length === 0) {
        cb({});
        return;
      }
      cb({ video: sources[0], audio: 'loopback' });
    }).catch(() => cb({}));
  });

  buildTray();
  overlayWin = createOverlayWindow();

  const ok = await telegram.init();
  if (!ok) {
    await openLogin();
  }

  try {
    hotkeys.start();
  } catch (err) {
    const message = (err as Error).message;
    console.error('[hotkeys] failed to start:', err);
    if (process.platform === 'darwin') {
      dialog.showMessageBox({
        type: 'warning',
        title: 'WhisperPoke permissions required',
        message: 'Global hotkeys are disabled until Accessibility permission is granted.',
        detail: `${message}\n\nOpen System Settings > Privacy & Security > Accessibility and allow WhisperPoke (or your terminal during dev), then relaunch.`,
      }).catch(() => undefined);
    } else {
      dialog.showErrorBox('WhisperPoke', `Global hotkeys unavailable: ${message}`);
    }
  }

  if (process.argv.includes('--settings')) openSettings();
});

app.on('window-all-closed', () => {
  // No-op: keep running in tray.
});

app.on('before-quit', () => {
  hotkeys.stop();
});
