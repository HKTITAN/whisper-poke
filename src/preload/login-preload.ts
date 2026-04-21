import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  LoginStart: 'login:start',
  LoginStatus: 'login:status',
  LoginDone: 'login:done',
  LoginProvidePhone: 'login:provide-phone',
  LoginProvideCode: 'login:provide-code',
  LoginProvidePassword: 'login:provide-password',
  LoginSubmit: 'login:submit',
};

contextBridge.exposeInMainWorld('loginAPI', {
  start: () => ipcRenderer.invoke(IPC.LoginStart),
  submit: (kind: 'phone' | 'code' | 'password', value: string) =>
    ipcRenderer.send(IPC.LoginSubmit, { kind, value }),
  onAskPhone: (cb: () => void) => ipcRenderer.on(IPC.LoginProvidePhone, () => cb()),
  onAskCode: (cb: () => void) => ipcRenderer.on(IPC.LoginProvideCode, () => cb()),
  onAskPassword: (cb: () => void) => ipcRenderer.on(IPC.LoginProvidePassword, () => cb()),
  onStatus: (cb: (msg: string) => void) =>
    ipcRenderer.on(IPC.LoginStatus, (_e, m: string) => cb(m)),
  onDone: (cb: (r: { ok: boolean; error?: string }) => void) =>
    ipcRenderer.on(IPC.LoginDone, (_e, r) => cb(r)),
});
