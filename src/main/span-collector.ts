import http from 'node:http'
import type { CapturedEvent, BackendSpanData } from '../shared/types'
import type { TraceCorrelationEngine } from './trace-correlation-engine'
import { getMainWindow } from './window-manager'

let server: http.Server | null = null

const COLLECTOR_PORT = 9229

function createEventId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function makeBackendEvent(args: {
  traceId: string
  timestamp: number
  method: string
  route: string
  statusCode: number
  duration: number
  serviceName: string
  phase: 'request' | 'handler' | 'response'
  sourceStack?: string
  step?: string
}): CapturedEvent {
  const data: BackendSpanData = {
    route: args.route,
    method: args.method,
    statusCode: args.statusCode,
    duration: args.duration,
    serviceName: args.serviceName,
    phase: args.phase,
    ...(args.step ? { step: args.step } : {}),
    ...(args.sourceStack ? { sourceStack: args.sourceStack } : {})
  }

  return {
    id: createEventId(),
    traceId: args.traceId,
    type: 'backend-span',
    timestamp: args.timestamp,
    url: `${args.serviceName}:${args.method} ${args.route}`,
    data,
    ...(args.sourceStack ? { sourceStack: args.sourceStack } : {})
  }
}

export function startSpanCollector(traceEngine: TraceCorrelationEngine): void {
  server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })

    req.on('end', () => {
      try {
        const span = JSON.parse(body) as Record<string, unknown>

        const traceId = String(span.traceId ?? '')
        if (!traceId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing traceId' }))
          return
        }

        // Resolve sourceStack from multiple possible formats:
        // 1. sourceStack: "Error\n    at handler (/path:10:5)" (full V8 stack)
        // 2. stack: "..." (alias)
        // 3. sourceFile + sourceLine (simplified: we synthesize a stack)
        let sourceStack: string | undefined
        if (typeof span.sourceStack === 'string' && span.sourceStack.length > 0) {
          sourceStack = span.sourceStack
        } else if (typeof span.stack === 'string' && span.stack.length > 0) {
          sourceStack = span.stack
        } else if (typeof span.sourceFile === 'string' && span.sourceFile.length > 0) {
          const file = span.sourceFile
          const line = typeof span.sourceLine === 'number' ? span.sourceLine : 1
          const col = typeof span.sourceColumn === 'number' ? span.sourceColumn : 1
          const fn = typeof span.sourceFunction === 'string' ? span.sourceFunction : 'handler'
          sourceStack = `Error\n    at ${fn} (${file}:${line}:${col})`
        }

        const method = String(span.method ?? 'GET')
        const route = String(span.route ?? '/')
        const statusCode = typeof span.statusCode === 'number' ? span.statusCode : 200
        const duration = Math.max(0, typeof span.duration === 'number' ? span.duration : 0)
        const serviceName = String(span.serviceName ?? 'unknown')
        const endTimestamp = (typeof span.timestamp === 'number' ? span.timestamp : 0) || Date.now()
        const startTimestamp = Math.max(0, endTimestamp - duration)
        const handlerTimestamp = Math.min(
          endTimestamp,
          startTimestamp + Math.max(1, Math.floor(duration / 2))
        )

        const events: CapturedEvent[] = [
          makeBackendEvent({
            traceId,
            timestamp: startTimestamp,
            method,
            route,
            statusCode,
            duration,
            serviceName,
            phase: 'request',
            sourceStack
          }),
          makeBackendEvent({
            traceId,
            timestamp: handlerTimestamp,
            method,
            route,
            statusCode,
            duration,
            serviceName,
            phase: 'handler',
            step: 'route-handler',
            sourceStack
          }),
          makeBackendEvent({
            traceId,
            timestamp: endTimestamp,
            method,
            route,
            statusCode,
            duration,
            serviceName,
            phase: 'response',
            sourceStack
          })
        ]

        console.log(
          `[FlowLens] Span: ${method} ${route} — events=${events.length} sourceStack: ${sourceStack ? 'YES (' + sourceStack.split('\n').length + ' lines)' : 'MISSING'}`
        )

        const mainWindow = getMainWindow()
        for (const event of events) {
          traceEngine.ingestEvent(event)
          if (mainWindow) {
            mainWindow.webContents.send('trace:event-received', event)
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, hasSource: !!sourceStack, emittedEvents: events.length }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  })

  server.listen(COLLECTOR_PORT, () => {
    console.log(`[FlowLens] Span collector listening on :${COLLECTOR_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[FlowLens] Port ${COLLECTOR_PORT} in use, span collector disabled`)
    } else {
      console.error('[FlowLens] Span collector error:', err)
    }
  })
}

export function stopSpanCollector(): void {
  if (server) {
    server.close()
    server = null
  }
}
