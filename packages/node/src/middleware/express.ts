import type {
  FlowLensNodeConfig,
  ExpressMiddleware,
  ExpressRequest,
  ExpressResponse,
  ExpressNextFunction
} from '../types'
import { sendSpan } from '../sender'
import { captureStack } from '../stack-capture'

export function createExpressMiddleware(config: FlowLensNodeConfig): ExpressMiddleware {
  const collectorUrl = config.collectorUrl || 'http://localhost:9229'
  const headerName = config.headerName || 'x-flowlens-trace-id'
  const serviceName = config.serviceName

  return (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    if (config.enabled === false) {
      next()
      return
    }

    const traceId = req.headers[headerName] as string | undefined
    if (!traceId) {
      next()
      return
    }

    const start = Date.now()
    const requestStack = captureStack()

    const onFinish = (): void => {
      res.removeListener('finish', onFinish)
      const responseStack = captureStack()
      const duration = Date.now() - start
      const route = (req as ExpressRequest).route?.path || req.url || '/'
      const method = req.method || 'GET'

      sendSpan(collectorUrl, {
        traceId,
        route,
        method,
        statusCode: res.statusCode,
        duration,
        serviceName,
        timestamp: Date.now(),
        sourceStack: requestStack,
        requestStack,
        handlerStack: requestStack,
        responseStack
      })
    }

    res.on('finish', onFinish)
    next()
  }
}
