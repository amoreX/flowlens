import { useState, useEffect, useCallback, useRef } from 'react'
import type { CapturedEvent, TraceData } from '../types/events'

interface TraceMap {
  [traceId: string]: TraceData
}

export function useTraceEvents() {
  const [traces, setTraces] = useState<TraceData[]>([])
  const traceMapRef = useRef<TraceMap>({})
  const eventCountRef = useRef(0)
  const [eventCount, setEventCount] = useState(0)

  useEffect(() => {
    // Load existing traces on mount
    window.flowlens.getAllTraces().then((existing) => {
      const map: TraceMap = {}
      let count = 0
      for (const t of existing) {
        map[t.id] = t
        count += t.events.length
      }
      traceMapRef.current = map
      eventCountRef.current = count
      setEventCount(count)
      setTraces(existing)
    })

    // Subscribe to live events
    const unsubscribe = window.flowlens.onTraceEvent((event: CapturedEvent) => {
      const map = traceMapRef.current
      const existing = map[event.traceId]

      if (existing) {
        existing.events.push(event)
        existing.endTime = Math.max(existing.endTime, event.timestamp)
      } else {
        map[event.traceId] = {
          id: event.traceId,
          startTime: event.timestamp,
          endTime: event.timestamp,
          events: [event],
          url: event.url || '',
          rootEvent: event
        }
      }

      eventCountRef.current += 1
      setEventCount(eventCountRef.current)

      const sorted = Object.values(map).sort((a, b) => b.startTime - a.startTime)
      setTraces(sorted)
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
