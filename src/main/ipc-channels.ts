// Channel name constants shared by main & preload. Keeps renderers from
// hard-coding strings that silently drift out of sync.
export const IPC = {
  // Overlay <-> main
  OverlayStart: 'overlay:start',        // main → overlay: begin recording ({ mode, showTranscript })
  OverlayStop: 'overlay:stop',          // main → overlay: stop & send
  OverlayCancel: 'overlay:cancel',      // main → overlay: discard
  OverlayTooShort: 'overlay:too-short', // main → overlay: recording under minimum
  OverlaySent: 'overlay:sent',          // main → overlay: send succeeded
  OverlaySendFailed: 'overlay:send-failed', // main → overlay: send failed
  OverlayRecorded: 'overlay:recorded',  // overlay → main: { bytes, durationSec, transcript }
  OverlayDiscarded: 'overlay:discarded',// overlay → main
  OverlayError: 'overlay:error',        // overlay → main: string
  OverlayGetMicId: 'overlay:get-mic-id',// overlay → main (invoke)
  OverlayCommit: 'overlay:commit',      // overlay → main: user clicked Send
  OverlayRequestCancel: 'overlay:req-cancel', // overlay → main: user clicked Cancel
  OverlaySetMouseThrough: 'overlay:set-mouse-through', // overlay → main: toggle pass-through
  OverlayModeChange: 'overlay:mode-change', // main → overlay: hold→lock promotion ({ mode, kind })

  // Settings <-> main
  SettingsGet: 'settings:get',           // invoke
  SettingsSet: 'settings:set',           // invoke
  SettingsGetTgUser: 'settings:get-tg-user', // invoke → {name,username,phone}|null
  SettingsCaptureHotkey: 'settings:capture-hotkey', // invoke → { ok, combo, error }
  SettingsCaptureHotkeyLive: 'settings:capture-hotkey-live', // start live capture (main → settings updates)
  SettingsCaptureHotkeyCancel: 'settings:capture-hotkey-cancel',
  SettingsCaptureHotkeyProgress: 'settings:capture-hotkey-progress', // main → settings
  SettingsListMics: 'settings:list-mics',// invoke (runs in settings renderer, not main)
  SettingsLogout: 'settings:logout',     // invoke
  SettingsOpenLogin: 'settings:open-login', // invoke
  SettingsOpenMicTest: 'settings:open-mic-test', // invoke

  // Mic test window
  MicTestGetMicId: 'mictest:get-mic-id',

  // Quick-send overlay (Raycast-style composer)
  QuickSendOpen: 'quicksend:open',          // main → qs: window ready
  QuickSendClose: 'quicksend:close',        // qs → main: user hit Esc / clicked out
  QuickSendPickFiles: 'quicksend:pick-files', // qs → main (invoke) → string[] paths
  QuickSendSubmit: 'quicksend:submit',      // qs → main: { text, voice?, video?, files[] }
  QuickSendGetMicId: 'quicksend:get-mic-id',// qs → main (invoke)
  QuickSendStatus: 'quicksend:status',      // main → qs: progress string (sending…)
  QuickSendSent: 'quicksend:sent',          // main → qs: close with success
  QuickSendFailed: 'quicksend:failed',      // main → qs: error string
  QuickSendReset: 'quicksend:reset',        // main → qs: clear text/attachments + focus input

  // Tray state
  TrayStateChanged: 'tray:state-changed', // main internal

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
