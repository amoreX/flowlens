import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FlowLensNodeConfig } from '../types'
import { sendSpan } from '../sender'
import { captureStack } from '../stack-capture'

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void

/**
 * Wraps a raw Node.js HTTP handler with FlowLens tracing.
 *
 * ```ts
 * import { wrapHandler } from '@flowlens/node'
 * const handler = wrapHandler((req, res) => { ... }, { serviceName: 'my-api' })
 * http.createServer(handler)
 * ```
 */
export function wrapHandler(handler: NodeHandler, config: FlowLensNodeConfig): NodeHandler {
  const collectorUrl = config.collectorUrl || 'http://localhost:9229'
  const headerName = config.headerName || 'x-flowlens-trace-id'
  const serviceName = config.serviceName

  return (req: IncomingMessage, res: ServerResponse) => {
    if (config.enabled === false) {
      handler(req, res)
      return
    }

    const traceId = req.headers[headerName] as string | undefined
    if (!traceId) {
      handler(req, res)
      return
    }

    const start = Date.now()
    const requestStack = captureStack()

    res.on('finish', () => {
      const responseStack = captureStack()
      const duration = Date.now() - start
      sendSpan(collectorUrl, {
        traceId,
        route: req.url || '/',
        method: req.method || 'GET',
        statusCode: res.statusCode,
        duration,
        serviceName,
        timestamp: Date.now(),
        sourceStack: requestStack,
        requestStack,
        handlerStack: requestStack,
        responseStack
      })
    })

    handler(req, res)
  }
}
