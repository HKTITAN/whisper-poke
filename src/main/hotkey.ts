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

function nameFor(code: number): KeyName | null {
  for (const [name, codes] of Object.entries(MODIFIER_GROUPS)) {
    if (codes.includes(code)) return name;
  }
  for (const [name, c] of Object.entries(SINGLE_KEYS)) {
    if (c === code) return name;
  }
  return null;
}

export type CaptureKind = 'voice' | 'screen';
type ActiveMode = 'hold' | 'toggle';
interface ActiveState { kind: CaptureKind; mode: ActiveMode; }

// Events emitted:
//   'press'    { kind } — hold combo just became fully pressed
//   'release'  { kind } — hold combo is no longer fully pressed
//   'toggle'   { kind } — toggle combo fully pressed (rising edge only)
//   'lock'     { kind } — Shift tapped while a hold combo is active (upgrades to toggle/lock)
//   'cancel'          — Escape while any combo is active
//   'quicksend'       — rising edge on quick-send combo
export class HotkeyManager extends EventEmitter {
  private pressed = new Set<KeyName>();
  private active: ActiveState | null = null;
  private started = false;
  private paused = false;
  private holdPendingTimer: NodeJS.Timeout | null = null;
  private pendingKind: CaptureKind | null = null;
  private quickWasMatched = false;

  pause() {
    this.paused = true;
    this.clearHoldPending();
    this.pressed.clear();
    this.active = null;
  }

  resume() {
    this.paused = false;
    this.pressed.clear();
    this.active = null;
  }

  private clearHoldPending() {
    if (this.holdPendingTimer) {
      clearTimeout(this.holdPendingTimer);
      this.holdPendingTimer = null;
    }
    this.pendingKind = null;
  }

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
    this.active = null;
    this.clearHoldPending();
  }

  armIdle() {
    this.active = null;
  }

  private combosFor(kind: CaptureKind): { hold: KeyName[]; toggle: KeyName[] } {
    const s = getSettings();
    return kind === 'screen'
      ? { hold: s.screenHoldHotkey, toggle: s.screenToggleHotkey }
      : { hold: s.hotkey,           toggle: s.toggleHotkey };
  }

  private matches(combo: KeyName[]): boolean {
    return combo.length > 0 && combo.every((k) => this.pressed.has(k));
  }

  private isSuperset(inner: KeyName[], outer: KeyName[]): boolean {
    if (outer.length <= inner.length) return false;
    return inner.every((k) => outer.includes(k));
  }

  private onKey(code: number, down: boolean) {
    if (this.paused) return;

    // Escape taps cancel any active combo — doesn't need a matching combo.
    if (down && code === UiohookKey.Escape && this.active) {
      this.emit('cancel');
      return;
    }

    const name = nameFor(code);
    if (!name) return;
    if (down) this.pressed.add(name);
    else this.pressed.delete(name);

    const quick = getSettings().quickSendHotkey;
    const quickMatch = this.matches(quick);
    if (quickMatch && !this.quickWasMatched && down && this.active === null) {
      this.quickWasMatched = true;
      this.emit('quicksend');
      return;
    }
    if (!quickMatch) this.quickWasMatched = false;

    const voice  = this.combosFor('voice');
    const screen = this.combosFor('screen');

    if (this.active === null) {
      // Evaluate toggle hits first (prefer more specific = longer).
      const toggleCandidates: Array<{ kind: CaptureKind; len: number }> = [];
      if (this.matches(voice.toggle))  toggleCandidates.push({ kind: 'voice',  len: voice.toggle.length });
      if (this.matches(screen.toggle)) toggleCandidates.push({ kind: 'screen', len: screen.toggle.length });
      toggleCandidates.sort((a, b) => b.len - a.len);

      if (toggleCandidates.length > 0) {
        this.clearHoldPending();
        const kind = toggleCandidates[0].kind;
        this.active = { kind, mode: 'toggle' };
        this.emit('toggle', { kind });
        return;
      }

      // Then hold (also prefer longer; defer if toggle is a superset of hold).
      const holdCandidates: Array<{ kind: CaptureKind; len: number; needsDefer: boolean }> = [];
      if (this.matches(voice.hold)) {
        holdCandidates.push({
          kind: 'voice', len: voice.hold.length,
          needsDefer: this.isSuperset(voice.hold, voice.toggle),
        });
      }
      if (this.matches(screen.hold)) {
        holdCandidates.push({
          kind: 'screen', len: screen.hold.length,
          needsDefer: this.isSuperset(screen.hold, screen.toggle),
        });
      }
      holdCandidates.sort((a, b) => b.len - a.len);
      const pick = holdCandidates[0];

      if (pick) {
        if (pick.needsDefer && !this.holdPendingTimer) {
          this.pendingKind = pick.kind;
          this.holdPendingTimer = setTimeout(() => {
            this.holdPendingTimer = null;
            const k = this.pendingKind;
            this.pendingKind = null;
            if (!k || this.active !== null) return;
            const combos = this.combosFor(k);
            if (this.matches(combos.hold)) {
              this.active = { kind: k, mode: 'hold' };
              this.emit('press', { kind: k });
            }
          }, 140);
        } else if (!pick.needsDefer) {
          this.active = { kind: pick.kind, mode: 'hold' };
          this.emit('press', { kind: pick.kind });
        }
      } else {
        this.clearHoldPending();
      }
    } else if (this.active.mode === 'hold') {
      const { hold } = this.combosFor(this.active.kind);
      // Shift tapped while the hold combo is active → upgrade to a lock
      // (toggle mode). Releasing the hold keys afterward won't stop recording;
      // the user commits via the toggle hotkey or the overlay Send button.
      if (down && name === 'Shift' && !hold.includes('Shift') && this.matches(hold)) {
        this.active = { kind: this.active.kind, mode: 'toggle' };
        this.emit('lock', { kind: this.active.kind });
        return;
      }
      if (!this.matches(hold)) {
        const kind = this.active.kind;
        this.active = null;
        this.emit('release', { kind });
      }
    } else if (this.active.mode === 'toggle') {
      const { toggle } = this.combosFor(this.active.kind);
      if (down && this.matches(toggle)) {
        const kind = this.active.kind;
        this.active = null;
        this.emit('toggle', { kind });
      }
    }
  }

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
    const onUp = (_e: { keycode: number }) => {
      if (settled) return;
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

export function startLiveCapture(
  onUpdate: (keys: KeyName[]) => void,
  onCommit: (combo: KeyName[]) => void,
  onError: (err: Error) => void,
  timeoutMs = 10000,
): () => void {
  const held = new Set<KeyName>();
  let settled = false;

  const pushUpdate = () => onUpdate(Array.from(held));

  const onDown = (e: { keycode: number }) => {
    const n = nameFor(e.keycode);
    if (n) { held.add(n); pushUpdate(); }
  };
  const onUp = (_e: { keycode: number }) => {
    if (settled) return;
    settled = true;
    cleanup();
    const combo = Array.from(held);
    if (combo.length === 0) onError(new Error('No keys captured'));
    else onCommit(combo);
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
    onError(new Error('Capture timed out'));
  }, timeoutMs);

  uIOhook.on('keydown', onDown);
  uIOhook.on('keyup', onUp);

  return () => {
    if (settled) return;
    settled = true;
    cleanup();
    onError(new Error('Capture canceled'));
  };
}
