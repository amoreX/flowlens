import { contextBridge, ipcRenderer } from 'electron'
import type { CapturedEvent, TraceData, SourceResponse } from '../shared/types'

const api = {
  loadTargetUrl: (url: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('target:load-url', url)
  },
  unloadTarget: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('target:unload')
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
  }
}

export type FlowLensAPI = typeof api

contextBridge.exposeInMainWorld('flowlens', api)
