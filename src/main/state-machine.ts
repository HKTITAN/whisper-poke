import { EventEmitter } from 'events';

export type PTTState = 'Idle' | 'Recording' | 'Canceling' | 'Sending';
export type Mode = 'hold' | 'toggle';
export type CaptureKind = 'voice' | 'screen';

// State machine for the push-to-talk flow. Decoupled from I/O — the main
// process wires hotkey + overlay + telegram events into transitions.
//
//   Idle
//    ├── press(hold)   → Recording (hold mode, release sends)
//    └── press(toggle) → Recording (toggle mode, second press sends)
//   Recording
//    ├── release       → Sending    (hold mode only; ignored in toggle)
//    ├── toggle        → Sending    (toggle mode only)
//    ├── commit        → Sending    (overlay Send button; works in any mode)
//    └── cancel        → Canceling
//   Canceling → Idle (after overlay acks discard)
//   Sending   → Idle (after send completes or fails)
export class PTTStateMachine extends EventEmitter {
  private _state: PTTState = 'Idle';
  private _mode: Mode = 'hold';
  private _kind: CaptureKind = 'voice';

  get state(): PTTState {
    return this._state;
  }

  get mode(): Mode {
    return this._mode;
  }

  get kind(): CaptureKind {
    return this._kind;
  }

  private transition(next: PTTState) {
    if (this._state === next) return;
    const prev = this._state;
    this._state = next;
    this.emit('change', { prev, next, mode: this._mode, kind: this._kind });
    this.emit(next.toLowerCase());
  }

  press(mode: Mode = 'hold', kind: CaptureKind = 'voice') {
    if (this._state === 'Idle') {
      this._mode = mode;
      this._kind = kind;
      this.transition('Recording');
    }
  }

  release() {
    // Only the hold-mode flow auto-sends on release.
    if (this._state === 'Recording' && this._mode === 'hold') {
      this.transition('Sending');
    }
  }

  toggle() {
    // In toggle mode, a second press of the toggle combo commits the recording.
    if (this._state === 'Recording' && this._mode === 'toggle') {
      this.transition('Sending');
    }
  }

  commit() {
    // Overlay Send button — works regardless of mode.
    if (this._state === 'Recording') {
      this.transition('Sending');
    }
  }

  cancel() {
    if (this._state === 'Recording') this.transition('Canceling');
  }

  finished() {
    // Called after Sending or Canceling completes.
    if (this._state === 'Sending' || this._state === 'Canceling') {
      this.transition('Idle');
    }
  }
}
