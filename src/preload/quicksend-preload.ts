import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  QuickSendClose: 'quicksend:close',
  QuickSendPickFiles: 'quicksend:pick-files',
  QuickSendSubmit: 'quicksend:submit',
  QuickSendGetMicId: 'quicksend:get-mic-id',
  QuickSendStatus: 'quicksend:status',
  QuickSendSent: 'quicksend:sent',
  QuickSendFailed: 'quicksend:failed',
  QuickSendReset: 'quicksend:reset',
};

export interface QSFileAttach {
  path: string;
  name: string;
  size: number;
}
export interface QSSubmitPayload {
  text: string;
  voice?: { bytes: ArrayBuffer; durationSec: number };
  video?: { bytes: ArrayBuffer; durationSec: number; mime: string };
  files: QSFileAttach[];
}

contextBridge.exposeInMainWorld('quickSendAPI', {
  close: () => ipcRenderer.send(IPC.QuickSendClose),
  pickFiles: (): Promise<QSFileAttach[]> =>
    ipcRenderer.invoke(IPC.QuickSendPickFiles),
  submit: (payload: QSSubmitPayload) =>
    ipcRenderer.send(IPC.QuickSendSubmit, payload),
  getMicId: (): Promise<string> => ipcRenderer.invoke(IPC.QuickSendGetMicId),
  onStatus: (cb: (msg: string) => void) =>
    ipcRenderer.on(IPC.QuickSendStatus, (_e, m: string) => cb(m)),
  onSent: (cb: () => void) =>
    ipcRenderer.on(IPC.QuickSendSent, () => cb()),
  onFailed: (cb: (err: string) => void) =>
    ipcRenderer.on(IPC.QuickSendFailed, (_e, m: string) => cb(m)),
  onReset: (cb: () => void) =>
    ipcRenderer.on(IPC.QuickSendReset, () => cb()),
});
