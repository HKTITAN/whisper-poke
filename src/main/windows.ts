import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

const PRELOAD_DIR = path.join(__dirname, '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

const OVERLAY_WIDTH = 340;
const OVERLAY_HEIGHT = 72;

export function createOverlayWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const { workArea } = primary;
  const x = Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2);
  const y = workArea.y + 16;

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
  win.setIgnoreMouseEvents(true, { forward: false });
  win.loadFile(path.join(RENDERER_DIR, 'overlay', 'index.html'));

  return win;
}

export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 520,
    resizable: false,
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
