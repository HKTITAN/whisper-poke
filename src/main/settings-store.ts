import Store from 'electron-store';

export interface AppSettings {
  // uiohook-napi key combo — array of key names that must all be held.
  // Default: Ctrl + Win (Meta/Super). Escape always cancels while held.
  hotkey: string[];
  // Device ID for getUserMedia. Empty string = system default.
  micDeviceId: string;
  // Whether we have completed Telegram login at least once.
  loggedIn: boolean;
}

const defaults: AppSettings = {
  hotkey: ['Ctrl', 'Meta'],
  micDeviceId: '',
  loggedIn: false,
};

const store = new Store<AppSettings>({
  name: 'settings',
  defaults,
});

export function getSettings(): AppSettings {
  return {
    hotkey: store.get('hotkey'),
    micDeviceId: store.get('micDeviceId'),
    loggedIn: store.get('loggedIn'),
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
