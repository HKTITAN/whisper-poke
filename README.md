# WhisperPoke

Push-to-talk desktop overlay for Windows that streams voice notes straight to
[Poke](https://t.me/interaction_poke_bot) on Telegram. Built with Electron +
TypeScript, using the Telegram **User API** (MTProto, via
[`telegram`](https://www.npmjs.com/package/telegram) / gramjs) — messages are
sent from your account, not a bot.

## How it works

1. Hold the global hotkey (default **Ctrl + Win**) anywhere in Windows.
2. A minimal overlay slides down from the top-center of the screen, showing a
   live waveform and elapsed timer while your microphone is captured.
3. Release the hotkey → the audio is encoded as OGG/Opus and sent as a voice
   note to `@interaction_poke_bot`.
4. Press **Esc** while still holding → the recording is discarded; nothing is
   sent.

The hotkey is global and press-and-hold — implemented with
[`uiohook-napi`](https://github.com/SnosMe/uiohook-napi) so we get real
`keydown`/`keyup` events (Electron's `globalShortcut` only fires on press).

## First-time setup

1. Copy your Telegram API credentials into `.env`:
   ```
   TELEGRAM_API_ID=...
   TELEGRAM_API_HASH=...
   POKE_BOT_USERNAME=interaction_poke_bot
   ```
   Get them from <https://my.telegram.org>.

2. Install deps and build:
   ```
   npm install
   npm run build
   ```

3. Launch:
   ```
   npm start
   ```

   On first launch a sign-in window opens: enter phone number → OTP → optional
   2FA password. The StringSession is stored in OS-level credential storage via
   [`keytar`](https://github.com/atom/node-keytar), so subsequent launches are
   silent.

## Settings

Right-click the tray icon → **Settings** to:

- **Remap the hotkey** — click *Remap*, hold the new combo, release.
- **Pick a microphone** — list is populated from `navigator.mediaDevices`.
- **Log out of Telegram** — clears the keytar session.

## Project layout

```
src/
├── main/              # Electron main process
│   ├── index.ts       # Entry + IPC wiring + PTT orchestration
│   ├── telegram.ts    # gramjs client, login, sendVoiceNote
│   ├── hotkey.ts      # uiohook-napi press/release/cancel detection
│   ├── state-machine.ts  # Idle → Recording → {Sending|Canceling} → Idle
│   ├── session-store.ts  # keytar wrapper
│   ├── settings-store.ts # electron-store wrapper
│   ├── windows.ts     # Overlay / Settings / Login BrowserWindow factories
│   └── ipc-channels.ts
├── preload/           # contextBridge surfaces per window
└── renderer/
    ├── overlay/       # Recording UI — MediaRecorder + AnalyserNode waveform
    ├── settings/      # Preferences panel
    └── login/         # Telegram phone/OTP flow
```

## State machine

```
          press               release
Idle ─────────────► Recording ─────────► Sending ──► Idle
                       │
                       │ Esc (while held)
                       ▼
                   Canceling ──────────────────────► Idle
```

All transitions are owned by `PTTStateMachine`; the main process listens for
`change` events and drives the overlay + Telegram pipeline from there.
