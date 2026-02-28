import { contextBridge, ipcRenderer } from 'electron'
import type { CapturedEvent, TraceData, SourceResponse, DomEventData } from '../shared/types'

const api = {
  loadTargetUrl: (url: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('target:load-url', url)
  },
  unloadTarget: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('target:unload')
  },
  reloadTarget: (): Promise<{ success: boolean; reason?: string }> => {
    return ipcRenderer.invoke('target:reload')
  },
  getAllTraces: (): Promise<TraceData[]> => {
    return ipcRenderer.invoke('trace:get-all')
  },
  getTrace: (id: string): Promise<TraceData | null> => {
    return ipcRenderer.invoke('trace:get', id)
  },
  clearTraces: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('trace:clear')
  },
  fetchSource: (fileUrl: string): Promise<SourceResponse> => {
    return ipcRenderer.invoke('source:fetch', fileUrl)
  },
  setSplitRatio: (ratio: number): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('target:set-split', ratio)
  },
  highlightDomTarget: (
    data: DomEventData
  ): Promise<{ success: boolean; reason?: string }> => {
    return ipcRenderer.invoke('target:highlight-dom', data)
  },
  onTraceEvent: (callback: (event: CapturedEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: CapturedEvent): void => {
      callback(data)
    }
    ipcRenderer.on('trace:event-received', handler)
    return () => {
      ipcRenderer.removeListener('trace:event-received', handler)
    }
  },
  onTargetLoaded: (callback: (url: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => {
      callback(url)
    }
    ipcRenderer.on('target:loaded', handler)
    return () => {
      ipcRenderer.removeListener('target:loaded', handler)
    }
  },

  // SDK mode
  startSdkMode: (): Promise<{ success: boolean; connectedClients: number }> => {
    return ipcRenderer.invoke('sdk:start-listening')
  },
  stopSdkMode: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('sdk:stop-listening')
  },
  getSdkConnectionCount: (): Promise<number> => {
    return ipcRenderer.invoke('sdk:get-connection-count')
  },
  onSdkConnectionCount: (callback: (count: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, count: number): void => {
      callback(count)
    }
    ipcRenderer.on('sdk:connection-count', handler)
    return () => {
      ipcRenderer.removeListener('sdk:connection-count', handler)
    }
  }
}

export type FlowLensAPI = typeof api

contextBridge.exposeInMainWorld('flowlens', api)
