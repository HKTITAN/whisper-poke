# Changelog

All notable changes to **WhisperPoke** will be documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/).

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
