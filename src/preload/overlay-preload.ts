import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  OverlayStart: 'overlay:start',
  OverlayStop: 'overlay:stop',
  OverlayCancel: 'overlay:cancel',
  OverlayTooShort: 'overlay:too-short',
  OverlaySent: 'overlay:sent',
  OverlaySendFailed: 'overlay:send-failed',
  OverlayRecorded: 'overlay:recorded',
  OverlayDiscarded: 'overlay:discarded',
  OverlayError: 'overlay:error',
  OverlayGetMicId: 'overlay:get-mic-id',
};

contextBridge.exposeInMainWorld('overlayAPI', {
  onStart: (cb: () => void) => ipcRenderer.on(IPC.OverlayStart, () => cb()),
  onStop: (cb: () => void) => ipcRenderer.on(IPC.OverlayStop, () => cb()),
  onCancel: (cb: () => void) => ipcRenderer.on(IPC.OverlayCancel, () => cb()),
  onSent: (cb: () => void) => ipcRenderer.on(IPC.OverlaySent, () => cb()),
  onSendFailed: (cb: (msg: string) => void) =>
    ipcRenderer.on(IPC.OverlaySendFailed, (_e, msg: string) => cb(msg)),
  onTooShort: (cb: () => void) => ipcRenderer.on(IPC.OverlayTooShort, () => cb()),
  sendRecorded: (bytes: ArrayBuffer, durationSec: number) =>
    ipcRenderer.send(IPC.OverlayRecorded, { bytes, durationSec }),
  sendDiscarded: () => ipcRenderer.send(IPC.OverlayDiscarded),
  sendError: (msg: string) => ipcRenderer.send(IPC.OverlayError, msg),
  getMicId: (): Promise<string> => ipcRenderer.invoke(IPC.OverlayGetMicId),
});
