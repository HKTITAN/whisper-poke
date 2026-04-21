import { contextBridge, ipcRenderer, shell } from 'electron';

const IPC = {
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsGetTgUser: 'settings:get-tg-user',
  SettingsCaptureHotkey: 'settings:capture-hotkey',
  SettingsCaptureHotkeyLive: 'settings:capture-hotkey-live',
  SettingsCaptureHotkeyCancel: 'settings:capture-hotkey-cancel',
  SettingsCaptureHotkeyProgress: 'settings:capture-hotkey-progress',
  SettingsLogout: 'settings:logout',
  SettingsOpenLogin: 'settings:open-login',
  SettingsOpenMicTest: 'settings:open-mic-test',
};

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke(IPC.SettingsGet),
  set: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.SettingsSet, patch),
  getTgUser: () => ipcRenderer.invoke(IPC.SettingsGetTgUser),
  captureHotkey: (which: string) =>
    ipcRenderer.invoke(IPC.SettingsCaptureHotkey, which),
  captureHotkeyLive: (which: string) =>
    ipcRenderer.invoke(IPC.SettingsCaptureHotkeyLive, which),
  captureHotkeyCancel: () =>
    ipcRenderer.invoke(IPC.SettingsCaptureHotkeyCancel),
  onCaptureHotkeyProgress: (cb: (keys: string[]) => void) =>
    ipcRenderer.on(IPC.SettingsCaptureHotkeyProgress, (_e, keys: string[]) => cb(keys)),
  logout: () => ipcRenderer.invoke(IPC.SettingsLogout),
  openLogin: () => ipcRenderer.invoke(IPC.SettingsOpenLogin),
  openMicTest: () => ipcRenderer.invoke(IPC.SettingsOpenMicTest),
  openExternal: (url: string) => shell.openExternal(url),
});
