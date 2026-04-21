import { uIOhook, UiohookKey } from 'uiohook-napi';
import { EventEmitter } from 'events';
import { getSettings } from './settings-store';

// Map human-readable key names <-> uiohook keycodes.
// We normalise left/right modifiers to a single name so "Ctrl" matches either.
type KeyName = string;

const MODIFIER_GROUPS: Record<KeyName, number[]> = {
  Ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  Shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
  Alt: [UiohookKey.Alt, UiohookKey.AltRight],
  Meta: [UiohookKey.Meta, UiohookKey.MetaRight], // Win key on Windows
};

// Single-value keys we commonly remap to.
const SINGLE_KEYS: Record<KeyName, number> = {
  Escape: UiohookKey.Escape,
  Space: UiohookKey.Space,
  F1: UiohookKey.F1, F2: UiohookKey.F2, F3: UiohookKey.F3, F4: UiohookKey.F4,
  F5: UiohookKey.F5, F6: UiohookKey.F6, F7: UiohookKey.F7, F8: UiohookKey.F8,
  F9: UiohookKey.F9, F10: UiohookKey.F10, F11: UiohookKey.F11, F12: UiohookKey.F12,
  Enter: UiohookKey.Enter,
  Tab: UiohookKey.Tab,
};

function codesFor(name: KeyName): number[] {
  if (MODIFIER_GROUPS[name]) return MODIFIER_GROUPS[name];
  if (SINGLE_KEYS[name] != null) return [SINGLE_KEYS[name]];
  return [];
}

function nameFor(code: number): KeyName | null {
  for (const [name, codes] of Object.entries(MODIFIER_GROUPS)) {
    if (codes.includes(code)) return name;
  }
  for (const [name, c] of Object.entries(SINGLE_KEYS)) {
    if (c === code) return name;
  }
  return null;
}

export class HotkeyManager extends EventEmitter {
  private pressed = new Set<KeyName>();
  private comboActive = false;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    uIOhook.on('keydown', (e) => this.onKey(e.keycode, true));
    uIOhook.on('keyup', (e) => this.onKey(e.keycode, false));
    uIOhook.start();
  }

  stop() {
    if (!this.started) return;
    try { uIOhook.stop(); } catch { /* ignore */ }
    this.started = false;
    this.pressed.clear();
    this.comboActive = false;
  }

  private get combo(): KeyName[] {
    return getSettings().hotkey;
  }

  private onKey(code: number, down: boolean) {
    const name = nameFor(code);

    // Escape while combo held → cancel.
    if (down && code === UiohookKey.Escape && this.comboActive) {
      this.emit('cancel');
      return;
    }

    if (!name) return;
    if (down) this.pressed.add(name);
    else this.pressed.delete(name);

    const all = this.combo.every((k) => this.pressed.has(k));
    if (all && !this.comboActive) {
      this.comboActive = true;
      this.emit('press');
    } else if (!all && this.comboActive) {
      this.comboActive = false;
      this.emit('release');
    }
  }

  // Returns human-readable key name for a raw uiohook keydown. Used by the
  // settings window to capture a new combo.
  static keyNameFromCode(code: number): KeyName | null {
    return nameFor(code);
  }
}

// Capture-mode listener used during hotkey remap in settings.
export async function captureCombo(timeoutMs = 8000): Promise<KeyName[]> {
  return new Promise((resolve, reject) => {
    const held = new Set<KeyName>();
    let settled = false;

    const onDown = (e: { keycode: number }) => {
      const n = nameFor(e.keycode);
      if (n) held.add(n);
    };
    const onUp = (e: { keycode: number }) => {
      if (settled) return;
      // First key-up = user released; snapshot whatever they had down.
      settled = true;
      cleanup();
      const combo = Array.from(held);
      if (combo.length === 0) reject(new Error('No keys captured'));
      else resolve(combo);
    };
    const cleanup = () => {
      uIOhook.off('keydown', onDown);
      uIOhook.off('keyup', onUp);
      clearTimeout(to);
    };
    const to = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Capture timed out'));
    }, timeoutMs);

    uIOhook.on('keydown', onDown);
    uIOhook.on('keyup', onUp);
  });
}
