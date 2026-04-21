import Store from 'electron-store';

export interface AppSettings {
  // uiohook-napi key combo — array of key names that must all be held.
  // Default: Ctrl + Win (Meta/Super). Escape always cancels while held.
  hotkey: string[];
  // Toggle-mode hotkey: tap once to start, tap again to send. Esc cancels.
  toggleHotkey: string[];
  // Raycast-style quick-send overlay hotkey. Opens a text/attachment composer.
  quickSendHotkey: string[];
  // Hold-to-record screen (+ audio) hotkey. Release sends to Poke as a video.
  screenHoldHotkey: string[];
  // Toggle screen recording: tap to start, tap to send, Esc cancels.
  screenToggleHotkey: string[];
  // Device ID for getUserMedia. Empty string = system default.
  micDeviceId: string;
  // Whether we have completed Telegram login at least once.
  loggedIn: boolean;
  // Show live (browser) transcript inside the overlay while recording.
  showTranscript: boolean;
  // Also send the transcript as a text message to Poke after the voice note.
  sendTranscript: boolean;
}

const defaults: AppSettings = {
  hotkey: ['Ctrl', 'Meta'],
  toggleHotkey: ['Ctrl', 'Shift', 'Meta'],
  quickSendHotkey: ['Ctrl', 'Space'],
  screenHoldHotkey: ['Ctrl', 'Alt'],
  screenToggleHotkey: ['Ctrl', 'Shift', 'Alt'],
  micDeviceId: '',
  loggedIn: false,
  showTranscript: true,
  sendTranscript: true,
};

const store = new Store<AppSettings>({
  name: 'settings',
  defaults,
});

export function getSettings(): AppSettings {
  return {
    hotkey: store.get('hotkey'),
    toggleHotkey: store.get('toggleHotkey'),
    quickSendHotkey: store.get('quickSendHotkey'),
    screenHoldHotkey: store.get('screenHoldHotkey'),
    screenToggleHotkey: store.get('screenToggleHotkey'),
    micDeviceId: store.get('micDeviceId'),
    loggedIn: store.get('loggedIn'),
    showTranscript: store.get('showTranscript'),
    sendTranscript: store.get('sendTranscript'),
  };
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  store.set(key, value);
}

export function setSettings(patch: Partial<AppSettings>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) store.set(k, v as never);
  }
}
