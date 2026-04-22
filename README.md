# WhisperPoke

![WhisperPoke demo](assets/Recording%202026-04-21%20214659.gif)

Push-to-talk desktop overlay for Windows that streams voice notes straight to
[Poke](https://t.me/interaction_poke_bot) on Telegram. Built with Electron +
TypeScript, using the Telegram **User API** (MTProto, via
[`telegram`](https://www.npmjs.com/package/telegram) / gramjs) — messages are
sent from your account, not a bot.

## How it works

Two modes, both remappable:

**Hold-to-talk** (default **Ctrl + Win**):
1. Hold the hotkey anywhere in Windows.
2. The overlay slides in at the center of the screen, showing a live waveform,
   elapsed timer, and (optionally) a real-time transcript of what you're saying.
3. Release → audio is encoded as OGG/Opus and sent as a voice note to
   `@interaction_poke_bot`, followed by a text message containing the rough
   transcript.
4. **Esc** while still holding → the recording is discarded.

**Toggle mode** (default **Ctrl + Shift + Win**):
1. Tap once to start recording.
2. Tap again — or click the overlay's **Send** button — to commit and send.
3. **Esc** or the **Cancel** button discards.

The hotkey is global and press-and-hold — implemented with
[`uiohook-napi`](https://github.com/SnosMe/uiohook-napi) so we get real
`keydown`/`keyup` events (Electron's `globalShortcut` only fires on press).

## Install on Windows

Grab the latest `WhisperPoke-Setup-*.exe` from the
[Releases page](https://github.com/HKTITAN/whisper-poke/releases) and run it.
The installer lets you pick an install location, creates Start Menu and desktop
shortcuts, and launches the app when finished. No admin rights required (it
installs per-user by default).

After install, launch WhisperPoke once and sign in to Telegram — see setup
below.

## First-time setup

1. Copy your Telegram API credentials into `.env`:
   ```
   TELEGRAM_API_ID=...
   TELEGRAM_API_HASH=...
   POKE_BOT_USERNAME=interaction_poke_bot
   # optional: auto | wss | tcp (default: auto)
   TELEGRAM_TRANSPORT=auto
   ```
   Get them from <https://my.telegram.org>.

2. Install, build, and run:
   ```
   npm install
   npm run dev
   ```

   On first launch a sign-in window opens: enter phone number → OTP → optional
   2FA password. The StringSession is stored in OS-level credential storage via
   [`keytar`](https://github.com/atom/node-keytar), so subsequent launches are
   silent.

### Platform support

- **Windows** — tested and working. `Ctrl + Win` is the default combo.
- **macOS** — should build and run, untested. The Meta key in the hotkey combo
  maps to ⌘ (Command). You'll be prompted to grant **Accessibility** and
  **Microphone** permissions (System Settings → Privacy & Security) the first
  time you hold the hotkey — `uiohook-napi` needs Accessibility to see global
  key events.
- **Linux** — should build and run on X11, untested. Wayland is not supported
  by `uiohook-napi` — run an X11 session or use Xwayland. You may need to
  install `libsecret-1-dev` (or equivalent) before `npm install` so `keytar`
  can compile against libsecret.

Build steps are the same everywhere:

```
npm install    # compiles native modules (uiohook-napi, keytar) for Electron
npm run dev    # builds TS + launches Electron
```

To produce a packaged installer for your current OS:

```
npm run dist   # electron-builder → release/ (NSIS on Win, DMG on macOS, AppImage on Linux)
```

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

## Contributing

The Poke community is welcome to pitch in — bug reports, features, docs, and
cross-platform testing all help. See [CONTRIBUTING.md](CONTRIBUTING.md) for
setup and PR guidelines.

## License

[MIT](LICENSE) © WhisperPoke contributors
