import { EventEmitter } from 'events';

export type PTTState = 'Idle' | 'Recording' | 'Canceling' | 'Sending';

// State machine for the push-to-talk flow. Decoupled from I/O — the main
// process wires hotkey + overlay + telegram events into transitions.
//
//   Idle
//    └── press   → Recording
//   Recording
//    ├── release → Sending
//    └── cancel  → Canceling
//   Canceling → Idle (after overlay acks discard)
//   Sending   → Idle (after send completes or fails)
export class PTTStateMachine extends EventEmitter {
  private _state: PTTState = 'Idle';

  get state(): PTTState {
    return this._state;
  }

  private transition(next: PTTState) {
    if (this._state === next) return;
    const prev = this._state;
    this._state = next;
    this.emit('change', { prev, next });
    this.emit(next.toLowerCase());
  }

  press() {
    if (this._state === 'Idle') this.transition('Recording');
  }

  release() {
    if (this._state === 'Recording') this.transition('Sending');
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
