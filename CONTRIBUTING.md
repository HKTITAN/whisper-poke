# Contributing to WhisperPoke

Thanks for your interest in improving WhisperPoke! This project is built by and
for the [Poke](https://t.me/interaction_poke_bot) community — issues, PRs, and
ideas are all welcome.

## Ways to contribute

- **Report bugs** — open an [issue](https://github.com/HKTITAN/whisper-poke/issues)
  with repro steps, your OS, and logs (`%APPDATA%/whisper-poke/logs` on Windows).
- **Suggest features** — open a discussion or issue describing the use case
  before opening a PR for anything non-trivial, so we can align on scope.
- **Fix bugs / ship features** — see *Development setup* below.
- **Improve docs** — README, setup guides, troubleshooting tips.
- **Test on macOS / Linux** — the app should build on both; field reports and
  fixes are especially valuable since only Windows is regularly tested.

## Development setup

Prerequisites: Node.js 18+, npm, and platform build tools for native modules
(`windows-build-tools` / Xcode CLT / `build-essential` + `libsecret-1-dev`).

```bash
git clone https://github.com/HKTITAN/whisper-poke.git
cd whisper-poke
npm install
cp .env.example .env      # fill in TELEGRAM_API_ID / TELEGRAM_API_HASH
npm run dev
```

Build an installer for your OS:

```bash
npm run dist              # writes to release/
```

## Pull request checklist

- Branch from `main`; keep PRs focused on one change.
- `npm run build` passes with no TypeScript errors.
- Manually verify the push-to-talk flow end-to-end (press → release → message
  arrives; Esc → discards) before requesting review.
- If you changed the state machine, hotkey handling, or Telegram pipeline,
  describe what you tested in the PR body.
- Update `README.md` / `CHANGELOG.md` when user-visible behavior changes.
- Don't commit `.env`, session strings, or anything from `release/` or `dist/`.

## Code style

- TypeScript, 2-space indent, no semicolons removed — match surrounding code.
- Keep the main/preload/renderer split clean: renderers never touch Node APIs
  directly, only through `contextBridge` surfaces in `src/preload/`.
- New IPC channels go in `src/main/ipc-channels.ts`.

## Reporting security issues

Please **don't** file public issues for security vulnerabilities (credential
leaks, session exfiltration, RCE in the renderer, etc.). Email the maintainer
or use GitHub's private vulnerability reporting instead.

## Code of conduct

Be kind. Assume good faith. This is a small community project — keep
discussions constructive and on-topic.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
