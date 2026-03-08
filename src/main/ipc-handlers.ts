import { ipcMain } from 'electron'
import { TraceCorrelationEngine } from './trace-correlation-engine'
import {
  createTargetView,
  destroyTargetView,
  setTargetSplitRatio,
  highlightDomTarget,
  reloadTargetView,
  startInspectMode,
  stopInspectMode
} from './target-view'
import { fetchSourceFile, clearSourceCache } from './source-fetcher'
import type { DomEventData } from '../shared/types'

export function registerIpcHandlers(traceEngine: TraceCorrelationEngine): void {
  ipcMain.handle('target:load-url', (_event, url: string) => {
    createTargetView(url, traceEngine)
    return { success: true }
  })

  ipcMain.handle('target:unload', () => {
    destroyTargetView()
    traceEngine.clear()
    clearSourceCache()
    return { success: true }
  })

  ipcMain.handle('trace:get-all', () => {
    return traceEngine.getAllTraces()
  })

  ipcMain.handle('trace:get', (_event, id: string) => {
    return traceEngine.getTrace(id) || null
  })

  ipcMain.handle('trace:clear', () => {
    traceEngine.clear()
    return { success: true }
  })

  ipcMain.handle('source:fetch', (_event, fileUrl: string) => {
    return fetchSourceFile(fileUrl)
  })

  ipcMain.handle('target:set-split', (_event, ratio: number) => {
    setTargetSplitRatio(ratio)
    return { success: true }
  })

  ipcMain.handle('target:highlight-dom', (_event, data: DomEventData) => {
    return highlightDomTarget(data)
  })

  ipcMain.handle('target:reload', () => {
    return reloadTargetView()
  })

  ipcMain.handle('target:inspect-start', () => {
    return startInspectMode()
  })

  ipcMain.handle('target:inspect-stop', () => {
    stopInspectMode()
    return { success: true }
  })
}
