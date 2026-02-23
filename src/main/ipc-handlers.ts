import { ipcMain } from 'electron'
import { TraceCorrelationEngine } from './trace-correlation-engine'
import { createTargetView, destroyTargetView } from './target-view'
import { fetchSourceFile, clearSourceCache } from './source-fetcher'

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
}
