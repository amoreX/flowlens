import type { IncomingMessage, ServerResponse } from 'node:http'

export interface FlowLensNodeConfig {
  /** Service name for identifying this backend in traces */
  serviceName: string
  /** Span collector URL. Default: 'http://localhost:9229' */
  collectorUrl?: string
  /** Enable/disable middleware. Default: true */
  enabled?: boolean
  /** Header name for trace ID. Default: 'x-flowlens-trace-id' */
  headerName?: string
}

export type ExpressRequest = IncomingMessage & {
  route?: { path?: string }
  path?: string
  url?: string
  method?: string
}

export type ExpressResponse = ServerResponse & {
  statusCode: number
}

export type ExpressNextFunction = (err?: unknown) => void

export type ExpressMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction
) => void

export interface SpanPayload {
  traceId: string
  route: string
  method: string
  statusCode: number
  duration: number
  serviceName: string
  timestamp: number
  /** Generic stack fallback for all phases */
  sourceStack?: string
  requestStack?: string
  handlerStack?: string
  responseStack?: string
}
