import type { CapturedEvent, EventType } from './types'
import { send as transportSend } from './transport'

let _currentTraceId = uid()
let _eventSeq = 0

export function uid(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

export function getCurrentTraceId(): string {
  return _currentTraceId
}

export function setCurrentTraceId(id: string): void {
  _currentTraceId = id
}

export function newTraceId(): string {
  _currentTraceId = uid()
  return _currentTraceId
}

export function emit(
  type: EventType,
  data: Record<string, unknown>,
  traceId?: string,
  extraStack?: string
): void {
  let stack: string | null = null
  try {
    stack = new Error().stack || null
  } catch {
    // ignore
  }
  if (extraStack) {
    stack = (stack || '') + '\n' + extraStack
  }

  const event: CapturedEvent = {
    id: uid(),
    traceId: traceId || _currentTraceId,
    type,
    timestamp: Date.now(),
    seq: ++_eventSeq,
    url: location.href,
    data,
    sourceStack: stack
  }

  transportSend(event)
}
