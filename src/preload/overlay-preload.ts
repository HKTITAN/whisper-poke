import { contextBridge, ipcRenderer } from 'electron';

// Keep channel strings in sync with src/main/ipc-channels.ts. We duplicate
// them here instead of importing so the preload bundle stays lean.
const IPC = {
  OverlayStart: 'overlay:start',
  OverlayStop: 'overlay:stop',
  OverlayCancel: 'overlay:cancel',
  OverlayRecorded: 'overlay:recorded',
  OverlayDiscarded: 'overlay:discarded',
  OverlayError: 'overlay:error',
  OverlayGetMicId: 'overlay:get-mic-id',
};

contextBridge.exposeInMainWorld('overlayAPI', {
  onStart: (cb: () => void) => ipcRenderer.on(IPC.OverlayStart, () => cb()),
  onStop: (cb: () => void) => ipcRenderer.on(IPC.OverlayStop, () => cb()),
  onCancel: (cb: () => void) => ipcRenderer.on(IPC.OverlayCancel, () => cb()),
  sendRecorded: (bytes: ArrayBuffer, durationSec: number) =>
    ipcRenderer.send(IPC.OverlayRecorded, { bytes, durationSec }),
  sendDiscarded: () => ipcRenderer.send(IPC.OverlayDiscarded),
  sendError: (msg: string) => ipcRenderer.send(IPC.OverlayError, msg),
  getMicId: (): Promise<string> => ipcRenderer.invoke(IPC.OverlayGetMicId),
});
