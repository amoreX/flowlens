import type { CapturedEvent, TraceData } from '../shared/types'

const MAX_TRACES = 500

function compareEvents(a: CapturedEvent, b: CapturedEvent): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
  return 0
}

function insertEventSorted(events: CapturedEvent[], event: CapturedEvent): void {
  const idx = events.findIndex((e) => compareEvents(event, e) < 0)
  if (idx === -1) {
    events.push(event)
  } else {
    events.splice(idx, 0, event)
  }
}

export class TraceCorrelationEngine {
  private traces = new Map<string, TraceData>()
  private insertionOrder: string[] = []

  ingestEvent(event: CapturedEvent): TraceData {
    const existing = this.traces.get(event.traceId)

    if (existing) {
      insertEventSorted(existing.events, event)
      existing.startTime = Math.min(existing.startTime, event.timestamp)
      existing.endTime = Math.max(existing.endTime, event.timestamp)
      if (compareEvents(event, existing.rootEvent) < 0) {
        existing.rootEvent = event
      }
      if (!existing.url && event.url) {
        existing.url = event.url
      }
      return existing
    }

    const trace: TraceData = {
      id: event.traceId,
      startTime: event.timestamp,
      endTime: event.timestamp,
      events: [event],
      url: event.url || '',
      rootEvent: event
    }

    this.traces.set(event.traceId, trace)
    this.insertionOrder.push(event.traceId)

    while (this.traces.size > MAX_TRACES) {
      const oldest = this.insertionOrder.shift()
      if (oldest) this.traces.delete(oldest)
    }

    return trace
  }

  getAllTraces(): TraceData[] {
    return Array.from(this.traces.values()).sort((a, b) => b.startTime - a.startTime)
  }

  getTrace(id: string): TraceData | undefined {
    return this.traces.get(id)
  }

  clear(): void {
    this.traces.clear()
    this.insertionOrder = []
  }
}
