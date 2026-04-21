// Channel name constants shared by main & preload. Keeps renderers from
// hard-coding strings that silently drift out of sync.
export const IPC = {
  // Overlay <-> main
  OverlayStart: 'overlay:start',        // main → overlay: begin recording
  OverlayStop: 'overlay:stop',          // main → overlay: stop & send
  OverlayCancel: 'overlay:cancel',      // main → overlay: discard
  OverlayTooShort: 'overlay:too-short', // main → overlay: recording under minimum
  OverlaySent: 'overlay:sent',          // main → overlay: send succeeded
  OverlaySendFailed: 'overlay:send-failed', // main → overlay: send failed
  OverlayRecorded: 'overlay:recorded',  // overlay → main: { bytes, durationSec }
  OverlayDiscarded: 'overlay:discarded',// overlay → main
  OverlayError: 'overlay:error',        // overlay → main: string
  OverlayGetMicId: 'overlay:get-mic-id',// overlay → main (invoke)

  // Settings <-> main
  SettingsGet: 'settings:get',           // invoke
  SettingsSet: 'settings:set',           // invoke
  SettingsGetTgUser: 'settings:get-tg-user', // invoke → {name,username,phone}|null
  SettingsCaptureHotkey: 'settings:capture-hotkey', // invoke → string[]
  SettingsListMics: 'settings:list-mics',// invoke (runs in settings renderer, not main)
  SettingsLogout: 'settings:logout',     // invoke
  SettingsOpenLogin: 'settings:open-login', // invoke

  // Login <-> main
  LoginStart: 'login:start',      // invoke
  LoginPhone: 'login:phone',      // invoke — returns user-entered phone
  LoginCode: 'login:code',        // invoke — returns OTP
  LoginPassword: 'login:password',// invoke — returns 2FA password
  LoginStatus: 'login:status',    // main → login window
  LoginDone: 'login:done',        // main → login window: success/failure
  LoginProvidePhone: 'login:provide-phone',       // main → login: prompt
  LoginProvideCode: 'login:provide-code',
  LoginProvidePassword: 'login:provide-password',
  LoginSubmit: 'login:submit',    // login → main: { kind: 'phone'|'code'|'password', value }
} as const;
