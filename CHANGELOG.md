# Changelog

All notable changes to **WhisperPoke** will be documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/).

---

## [Unreleased]

### Added
- **Toggle hotkey** (default **Ctrl + Shift + Win**): tap once to start,
  tap again to send. Useful for long dictations when you don't want to
  hold keys. `Esc` still cancels, and a new **Send** button in the overlay
  also commits the recording.
- **Live transcript** rendered inside the overlay using the browser's
  `SpeechRecognition` API (inspired by
  [freeflow](https://github.com/zachlatta/freeflow)). A setting toggles
  it on/off.
- When enabled, the **transcript is sent as a follow-up text message** to
  Poke after the voice note, framed as "Rough transcript of my dictation".
- Overlay now opens in the **center of the screen** with a larger layout
  that fits the transcript, a soft pulsing halo, and a richer
  multi-tone SFX palette for start / stop / sending / sent.
- **Tray icon** is now gray when idle and turns red while recording; the
  tray menu shows current hotkeys, quick-toggles for transcript settings,
  and a **Test microphone…** action that opens a small meter window.
- **Virtual keyboard** in Settings lights up your keys in real time while
  you remap a hotkey (inspired by [keyb.vercel.app](https://keyb.vercel.app)).

### Changed
- Overlay is wider (560×280) and centered rather than pinned to the top.

---

## [0.1.0] — 2026-04-21

Initial **early-access** release.

### Added
- Global push-to-talk hotkey (default **Ctrl + Win**, fully remappable in
  Settings) powered by `uiohook-napi` so press/hold/release are detected
  globally rather than one-shot like Electron's `globalShortcut`.
- Minimal top-center overlay that slides in on press, showing a live
  `AnalyserNode` waveform, an elapsed timer, and a **"Recording with Whisper
  Poke"** caption below the pill.
- Clean sent/cancel/too-short states with colour-coded caption + checkmark.
- **Esc while holding** cancels without sending.
- Telegram MTProto sign-in using the user API (phone → OTP → optional 2FA),
  via [`telegram` / gramjs](https://gram.js.org). Session is stored in the
  OS keychain with [`keytar`](https://github.com/atom/node-keytar).
- Voice notes are encoded as OGG/Opus and sent to `@interaction_poke_bot`
  as true Telegram voice messages (`DocumentAttributeAudio.voice = true`).
- **1-second minimum duration** filter — accidental taps don't spam Poke.
- Subtle synthesised SFX on start / stop / sent / cancel / too-short, generated
  via Web Audio so no binary assets ship.
- Tray icon (rendered from code, no PNG asset) with Settings / khe.money /
  Quit; left-click opens Settings.
- Settings window redesigned with a sidebar:
  - **General** — hotkey remap, microphone picker.
  - **Account** — real Telegram profile display (name, @username, phone) with
    avatar initials, distinct signed-in / signed-out states, sign-in and
    log-out actions.
  - **About** — version, early-access badge, credit to Harshit Khemani
    ([khe.money](https://www.khe.money)), passion-project disclaimer, and this
    version history.

### Known caveats
- Tested on Windows only; macOS and Linux should build and run but are
  unverified (see [README](./README.md#platform-support)).
- Wayland on Linux is not supported by `uiohook-napi` — use X11 / Xwayland.
