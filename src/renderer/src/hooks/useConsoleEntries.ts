import { useState, useEffect, useCallback, useRef } from 'react'
import type { CapturedEvent, ConsoleEventData, ErrorEventData } from '../types/events'

export type ConsoleLevel = 'all' | 'error' | 'warn' | 'info' | 'log' | 'debug'

export interface ConsoleEntry {
  id: string
  timestamp: number
  level: string
  message: string
}

const MAX_ENTRIES = 2000

function eventToConsoleEntry(event: CapturedEvent): ConsoleEntry | null {
  if (event.type === 'console') {
    const data = event.data as ConsoleEventData
    return {
      id: event.id,
      timestamp: event.timestamp,
      level: data.level,
      message: data.args.join(' ')
    }
  }
  if (event.type === 'error') {
    const data = event.data as ErrorEventData
    return {
      id: event.id,
      timestamp: event.timestamp,
      level: 'error',
      message: data.message + (data.stack ? '\n' + data.stack : '')
    }
  }
  return null
}

export function useConsoleEntries() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([])
  const [filter, setFilter] = useState<ConsoleLevel>('all')
  const entriesRef = useRef<ConsoleEntry[]>([])

  useEffect(() => {
    // Load existing traces and extract console entries
    window.flowlens.getAllTraces().then((traces) => {
      const initial: ConsoleEntry[] = []
      for (const t of traces) {
        for (const ev of t.events) {
          const entry = eventToConsoleEntry(ev)
          if (entry) initial.push(entry)
        }
      }
      initial.sort((a, b) => a.timestamp - b.timestamp)
      const capped = initial.slice(-MAX_ENTRIES)
      entriesRef.current = capped
      setEntries(capped)
    })

    // Subscribe to live events
    const unsubscribe = window.flowlens.onTraceEvent((event: CapturedEvent) => {
      const entry = eventToConsoleEntry(event)
      if (!entry) return

      const next = [...entriesRef.current, entry]
      if (next.length > MAX_ENTRIES) {
        next.splice(0, next.length - MAX_ENTRIES)
      }
      entriesRef.current = next
      setEntries(next)
    })

    return unsubscribe
  }, [])

  const clear = useCallback(() => {
    entriesRef.current = []
    setEntries([])
  }, [])

  const filtered = filter === 'all'
    ? entries
    : entries.filter((e) => e.level === filter)

  return { entries: filtered, allEntries: entries, filter, setFilter, clear }
}
