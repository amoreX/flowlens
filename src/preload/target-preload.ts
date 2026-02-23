import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__flowlens_bridge', {
  sendEvent: (event: unknown): void => {
    ipcRenderer.send('instrumentation:event', event)
  }
})
