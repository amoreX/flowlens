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
  startInspect: (): Promise<{
    cancelled?: boolean
    tagName?: string
    id?: string
    className?: string
    componentName?: string
    sourceFile?: string
    sourceLine?: number
  }> => {
    return ipcRenderer.invoke('target:inspect-start')
  },
  stopInspect: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('target:inspect-stop')
  }
}

export type FlowLensAPI = typeof api

contextBridge.exposeInMainWorld('flowlens', api)
