import type { CapturedEvent, TraceData } from '../shared/types'

const MAX_TRACES = 500

export class TraceCorrelationEngine {
  private traces = new Map<string, TraceData>()
  private insertionOrder: string[] = []

  ingestEvent(event: CapturedEvent): TraceData {
    const existing = this.traces.get(event.traceId)

    if (existing) {
      existing.events.push(event)
      existing.endTime = Math.max(existing.endTime, event.timestamp)
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
