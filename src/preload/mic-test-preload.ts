import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  MicTestGetMicId: 'mictest:get-mic-id',
};

contextBridge.exposeInMainWorld('micTestAPI', {
  getMicId: (): Promise<string> => ipcRenderer.invoke(IPC.MicTestGetMicId),
});
