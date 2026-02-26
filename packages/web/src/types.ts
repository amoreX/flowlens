export interface FlowLensWebConfig {
  /** WebSocket endpoint. Default: 'ws://localhost:9230' */
  endpoint?: string
  /** Enable/disable instrumentation. Default: true */
  enabled?: boolean
  /** Patch window.fetch. Default: true */
  patchFetch?: boolean
  /** Patch XMLHttpRequest. Default: true */
  patchXHR?: boolean
  /** Patch console methods. Default: true */
  patchConsole?: boolean
  /** Patch DOM event listeners. Default: true */
  patchDOM?: boolean
  /** Capture window errors and unhandled rejections. Default: true */
  captureErrors?: boolean
  /** Detect React state changes after events. Default: true */
  detectReactState?: boolean
}

export type EventType =
  | 'dom'
  | 'network-request'
  | 'network-response'
  | 'network-error'
  | 'console'
  | 'error'
  | 'state-change'

export interface CapturedEvent {
  id: string
  traceId: string
  type: EventType
  timestamp: number
  seq?: number
  url?: string
  data: Record<string, unknown>
  sourceStack?: string | null
}
