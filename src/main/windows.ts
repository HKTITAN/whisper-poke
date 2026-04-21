import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

const PRELOAD_DIR = path.join(__dirname, '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

const OVERLAY_WIDTH = 560;
const OVERLAY_HEIGHT = 280;

export function createOverlayWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const { workArea } = primary;
  const x = Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2);
  // Center vertically, biased slightly toward the top half so it doesn't
  // cover what the user is actively looking at.
  const y = Math.round(workArea.y + (workArea.height - OVERLAY_HEIGHT) * 0.42);

  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Start pass-through; renderer flips on mouse interaction when toggle
  // mode exposes the Send/Cancel buttons.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(RENDERER_DIR, 'overlay', 'index.html'));

  return win;
}

export function createMicTestWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 260,
    resizable: false,
    title: 'WhisperPoke — Test microphone',
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'mic-test-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(RENDERER_DIR, 'mic-test', 'index.html'));
  return win;
}

export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 720,
    height: 560,
    minWidth: 640,
    minHeight: 480,
    resizable: true,
    title: 'WhisperPoke — Settings',
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(RENDERER_DIR, 'settings', 'index.html'));
  return win;
}

const QS_WIDTH = 640;
const QS_HEIGHT = 360;

export function createQuickSendWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const { workArea } = primary;
  const x = Math.round(workArea.x + (workArea.width - QS_WIDTH) / 2);
  const y = Math.round(workArea.y + (workArea.height - QS_HEIGHT) * 0.32);
  const win = new BrowserWindow({
    width: QS_WIDTH,
    height: QS_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'quicksend-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(RENDERER_DIR, 'quicksend', 'index.html'));
  return win;
}

export function createLoginWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 380,
    resizable: false,
    title: 'WhisperPoke — Sign in to Telegram',
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'login-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(RENDERER_DIR, 'login', 'index.html'));
  return win;
}
