# Changelog

All notable changes to **WhisperPoke** will be documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/).

---

## [Unreleased]

---

## [0.2.0] — 2026-04-21

### Added
- **Toggle hotkey** (default **Ctrl + Shift + Win**): tap once to start,
  tap again to send. Useful for long dictations when you don't want to
  hold keys. `Esc` still cancels, and a **Send** button in the overlay
  also commits the recording.
- **Live transcript** rendered inside the overlay using the browser's
  `SpeechRecognition` API (inspired by
  [freeflow](https://github.com/zachlatta/freeflow)). A setting toggles
  it on/off. When enabled, the transcript is also sent as a follow-up
  text to Poke.
- **Quick-send modal (Ctrl + Space)** — a Raycast-style composer for
  typing a message to Poke, attaching files, recording a voice note, or
  recording a short video snippet. Re-invoking the hotkey refocuses the
  textarea and resets any leftover draft so each session starts clean.
- **Screen recording** — a new hold hotkey (**Ctrl + Alt** default) and
  a matching toggle (**Ctrl + Shift + Alt**) capture the primary screen
  plus system audio and send the result to Poke as a streaming video.
  The quick-send modal's **Screen** button captures the same way.
- **Lock mechanism** — while holding the voice or screen hotkey, tap
  **Shift** to promote the recording from hold to locked/toggle mode.
  Release your keys; the overlay's Send/Cancel buttons take over and
  the caption flips to "🔒 Locked".
- **Morphing status glyph** on the overlay — one SVG canvas that
  cross-dissolves between mic, screen, paper plane, check, and X as
  state changes (inspired by
  [benji.org/morphing-icons-with-claude](https://benji.org/morphing-icons-with-claude)).
- **Tray icon** is now gray when idle and turns red while recording;
  the tray menu shows current hotkeys and a **Test microphone…**
  action.
- **Virtual keyboard** in Settings lights up your keys in real time
  while you remap a hotkey (inspired by
  [keyb.vercel.app](https://keyb.vercel.app)).
- **Every outgoing message is now signed** with `(Sent with WhisperPoke)`
  so Poke can distinguish app-originated messages from manual ones.
- **Quick-send action buttons** (Voice / Files / Screen) use inline
  stroke SVG icons in place of emoji, a ghost resting state, hover
  lift, keyboard focus ring, and an accent-tinted active state.
  Voice and Screen buttons show a pulsing red dot while capturing.

### Changed
- **Unified design language** across the overlay and quick-send modal:
  graphite surface, soft rose-coral accent, consistent radius scale and
  typography (inspired by Wispr Flow). Shadows, borders, and motion
  curves are now shared tokens between both windows.
- Overlay is wider (560×280) and centered rather than pinned to the top.
- Ctrl + Space focus handling is more robust — the modal now always
  raises to the foreground and selects the textarea on reopen.

### Fixed
- Toggle hotkey (**Ctrl + Shift + Win**) now wins over the subset hold
  combo regardless of press order, via a 140 ms superset-aware defer.
- Tray icon reliably swaps between idle (gray) and recording (red) on
  Windows.
- Hotkeys are paused during settings remap so the capture flow can't
  trigger a stray recording mid-edit.

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
