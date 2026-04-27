# Agent development notes

## Cursor Cloud specific instructions

- Install project dependencies with `npm install`.
- Run the Electron app in Cursor Cloud with `dbus-run-session -- npm run dev`.
  The default Cloud DBus address may be disabled, and `keytar` needs a session
  bus so the Telegram login window can open.
