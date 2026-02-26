export type EventType =
  | 'dom'
  | 'network-request'
  | 'network-response'
  | 'network-error'
  | 'console'
  | 'error'
  | 'navigation'
  | 'backend-span'
  | 'state-change'

export interface DomEventData {
  eventType: string
  target: string
  tagName: string
  id?: string
  className?: string
  textContent?: string
  value?: string
}

export interface NetworkRequestData {
  requestId: string
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface NetworkResponseData {
  requestId: string
  method: string
  url: string
  status: number
  statusText: string
  duration: number
  headers?: Record<string, string>
  bodyPreview?: string
}

export interface NetworkErrorData {
  requestId: string
  method: string
  url: string
  error: string
  duration: number
}

export interface ConsoleEventData {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: string[]
}

export interface ErrorEventData {
  message: string
  filename?: string
  lineno?: number
  colno?: number
  stack?: string
  type: 'error' | 'unhandledrejection'
}

export interface NavigationEventData {
  url: string
  type: 'navigate' | 'spa-navigation'
}

export interface BackendSpanData {
  route: string
  method: string
  statusCode: number
  duration: number
  serviceName: string
  sourceStack?: string
  phase?: 'request' | 'handler' | 'response'
  step?: string
}

export interface StateChangeData {
  component: string
  hookIndex: number
  prevValue: string
  value: string
}

export type EventData =
  | DomEventData
  | NetworkRequestData
  | NetworkResponseData
  | NetworkErrorData
  | ConsoleEventData
  | ErrorEventData
  | NavigationEventData
  | BackendSpanData
  | StateChangeData

export interface CapturedEvent {
  id: string
  traceId: string
  type: EventType
  timestamp: number
  /** Per-process emission sequence used to order same-ms events deterministically */
  seq?: number
  url?: string
  data: EventData
  sourceStack?: string
}

export interface TraceData {
  id: string
  startTime: number
  endTime: number
  events: CapturedEvent[]
  url: string
  rootEvent: CapturedEvent
}

export interface SourceLocation {
  filePath: string
  line: number
  column: number
  functionName?: string
}

export interface SourceFetchResult {
  content: string
  filePath: string
  error?: undefined
  /** Maps transformed line numbers (from stack traces) → original source line numbers */
  lineMap?: Record<number, number>
}

export interface SourceFetchError {
  content?: undefined
  filePath: string
  error: string
}

export type SourceResponse = SourceFetchResult | SourceFetchError
