import { WebSocketServer, WebSocket } from 'ws'
import type { TraceCorrelationEngine } from './trace-correlation-engine'
import type { CapturedEvent } from '../shared/types'
import { getMainWindow } from './window-manager'

const WS_PORT = 9230

let wss: WebSocketServer | null = null

export function startWsServer(traceEngine: TraceCorrelationEngine): void {
  wss = new WebSocketServer({ port: WS_PORT })

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

        if (msg.type === 'event' && msg.payload?.event) {
          const event = msg.payload.event as CapturedEvent

          if (
            !event.id ||
            !event.traceId ||
            !event.type ||
            typeof event.timestamp !== 'number' ||
            !event.data
          ) {
            return
          }

          traceEngine.ingestEvent(event)

          const mainWindow = getMainWindow()
          if (mainWindow) {
            mainWindow.webContents.send('trace:event-received', event)
          }
        }
      } catch {
        // Invalid JSON — ignore
      }
    })

    ws.on('error', () => {
      // Swallow per-connection errors
    })
  })

  wss.on('listening', () => {
    console.log(`[FlowLens] WebSocket server listening on :${WS_PORT}`)
  })

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[FlowLens] Port ${WS_PORT} in use, WebSocket server disabled`)
    } else {
      console.error('[FlowLens] WebSocket server error:', err)
    }
  })
}

export function stopWsServer(): void {
  if (wss) {
    wss.close()
    wss = null
  }
}
