import { ipcMain } from 'electron'
import { TraceCorrelationEngine } from './trace-correlation-engine'
import { createTargetView, destroyTargetView, setTargetSplitRatio } from './target-view'
import { fetchSourceFile, clearSourceCache } from './source-fetcher'
import { getConnectedClientCount } from './ws-server'

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

  // SDK mode handlers
  ipcMain.handle('sdk:start-listening', () => {
    // SDK mode — WS server is always running, this just enters SDK mode in the UI
    return { success: true, connectedClients: getConnectedClientCount() }
  })

  ipcMain.handle('sdk:stop-listening', () => {
    traceEngine.clear()
    clearSourceCache()
    return { success: true }
  })

  ipcMain.handle('sdk:get-connection-count', () => {
    return getConnectedClientCount()
  })
}
