import { WebSocketServer, WebSocket } from 'ws'
import type { TraceCorrelationEngine } from './trace-correlation-engine'
import type { CapturedEvent } from '../shared/types'
import { getMainWindow } from './window-manager'

const WS_PORT = 9230

let wss: WebSocketServer | null = null
let connectedClients = 0

export function startWsServer(traceEngine: TraceCorrelationEngine): void {
  wss = new WebSocketServer({ port: WS_PORT })

  wss.on('connection', (ws: WebSocket) => {
    connectedClients++
    notifyRenderer('sdk:connection-count', connectedClients)

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

        if (msg.type === 'event' && msg.payload?.event) {
          const event = msg.payload.event as CapturedEvent
          traceEngine.ingestEvent(event)

          const mainWindow = getMainWindow()
          if (mainWindow) {
            mainWindow.webContents.send('trace:event-received', event)
          }
        } else if (msg.type === 'hello') {
          notifyRenderer('sdk:connected', msg.payload)
        }
      } catch {
        // Invalid JSON — ignore
      }
    })

    ws.on('close', () => {
      connectedClients--
      notifyRenderer('sdk:connection-count', connectedClients)
      if (connectedClients <= 0) {
        connectedClients = 0
        notifyRenderer('sdk:disconnected', null)
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
    connectedClients = 0
  }
}

export function getConnectedClientCount(): number {
  return connectedClients
}

function notifyRenderer(channel: string, data: unknown): void {
  const mainWindow = getMainWindow()
  if (mainWindow) {
    mainWindow.webContents.send(channel, data)
  }
}
