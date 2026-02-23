import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { TraceCorrelationEngine } from './trace-correlation-engine'
import { startSpanCollector, stopSpanCollector } from './span-collector'

const traceEngine = new TraceCorrelationEngine()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.flowlens.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers(traceEngine)
  startSpanCollector(traceEngine)
  createMainWindow()

  app.on('activate', () => {
    const { BrowserWindow } = require('electron')
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopSpanCollector()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
