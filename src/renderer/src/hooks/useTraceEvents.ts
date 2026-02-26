import { useState, useEffect, useCallback, useRef } from 'react'
import type { CapturedEvent, TraceData } from '../types/events'

interface TraceMap {
  [traceId: string]: TraceData
}

function compareEvents(a: CapturedEvent, b: CapturedEvent): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
  return 0
}

function recomputeTraceMeta(trace: TraceData): void {
  trace.events.sort(compareEvents)
  if (trace.events.length === 0) return
  trace.rootEvent = trace.events[0]
  trace.startTime = trace.events[0].timestamp
  trace.endTime = trace.events[trace.events.length - 1].timestamp
  if (!trace.url) {
    trace.url = trace.rootEvent.url || ''
  }
}

function upsertEvent(map: TraceMap, event: CapturedEvent): boolean {
  const existing = map[event.traceId]
  if (!existing) {
    map[event.traceId] = {
      id: event.traceId,
      startTime: event.timestamp,
      endTime: event.timestamp,
      events: [event],
      url: event.url || '',
      rootEvent: event
    }
    return true
  }

  if (existing.events.some((e) => e.id === event.id)) return false
  existing.events.push(event)
  recomputeTraceMeta(existing)
  return true
}

function mergeTraceSnapshot(map: TraceMap, snapshot: TraceData): void {
  if (snapshot.events.length === 0) return
  for (const event of snapshot.events) {
    upsertEvent(map, event)
  }
}

export function useTraceEvents() {
  const [traces, setTraces] = useState<TraceData[]>([])
  const traceMapRef = useRef<TraceMap>({})
  const eventCountRef = useRef(0)
  const [eventCount, setEventCount] = useState(0)

  useEffect(() => {
    // Subscribe first so we don't miss live events while loading snapshots.
    const unsubscribe = window.flowlens.onTraceEvent((event: CapturedEvent) => {
      const map = traceMapRef.current
      const inserted = upsertEvent(map, event)
      if (inserted) {
        eventCountRef.current += 1
        setEventCount(eventCountRef.current)
      }

      const sorted = Object.values(map).sort((a, b) => b.startTime - a.startTime)
      setTraces(sorted)
    })

    // Load existing traces on mount and merge with any already-received live events.
    window.flowlens.getAllTraces().then((existing) => {
      const map = traceMapRef.current
      for (const trace of existing) {
        mergeTraceSnapshot(map, trace)
      }

      traceMapRef.current = map
      const count = Object.values(map).reduce((sum, t) => sum + t.events.length, 0)
      eventCountRef.current = count
      setEventCount(count)
      setTraces(Object.values(map).sort((a, b) => b.startTime - a.startTime))
    }).catch(() => {
      // May fail in SDK mode or during initialization — safe to ignore
    })

    return unsubscribe
  }, [])

  const clearTraces = useCallback(() => {
    window.flowlens.clearTraces()
    traceMapRef.current = {}
    eventCountRef.current = 0
    setEventCount(0)
    setTraces([])
  }, [])

  return { traces, eventCount, clearTraces }
}
