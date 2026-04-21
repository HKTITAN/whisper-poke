import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsCaptureHotkey: 'settings:capture-hotkey',
  SettingsLogout: 'settings:logout',
  SettingsOpenLogin: 'settings:open-login',
};

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke(IPC.SettingsGet),
  set: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.SettingsSet, patch),
  captureHotkey: () => ipcRenderer.invoke(IPC.SettingsCaptureHotkey),
  logout: () => ipcRenderer.invoke(IPC.SettingsLogout),
  openLogin: () => ipcRenderer.invoke(IPC.SettingsOpenLogin),
});
