import { useState, useEffect, useRef, useCallback } from 'react'
import type { CapturedEvent } from '../types/events'
import { parseAllUserFrames, extractDisplayPath } from '../utils/stack-parser'

export interface LineHit {
  count: number
  lastTimestamp: number
  /** true if this was the most recent event's hit (deepest highlight) */
  isLatest: boolean
}

export interface FileHitData {
  filePath: string
  displayPath: string
  lines: Map<number, LineHit>
}

export interface TraceHitData {
  traceId: string
  files: Map<string, FileHitData>
  /** The last event's primary line (deepest color) */
  latestFile: string | null
  latestLine: number | null
  /** Monotonically increasing sequence number — forces React re-render even if same lines */
  seq: number
}

/** Cached source file content, shared across all traces */
export interface SourceFileCache {
  content: string | null
  loading: boolean
  error: string | null
  /** Maps transformed line numbers → original source line numbers (from source maps) */
  lineMap?: Record<number, number> | null
}

export interface SourceHitMap {
  /** Hit data for the current (most recent) trace — live mode */
  currentTraceHits: TraceHitData | null
  /** All trace hits indexed by traceId — for focus mode */
  allTraceHits: Map<string, TraceHitData>
  /** Source file content cache */
  sourceCache: Map<string, SourceFileCache>
  /** Ordered file list for current trace */
  currentFileOrder: string[]
  /** Active file in live mode */
  activeFile: string | null
  setActiveFile: (fp: string) => void
  /** Fetch a source file and add it to the cache (deduped) */
  fetchSourceIfNeeded: (filePath: string) => void
}

let globalSeq = 0

/** Compute hits for a set of events, marking the latest event's lines */
function computeTraceHits(traceId: string, events: CapturedEvent[]): TraceHitData {
  const files = new Map<string, FileHitData>()
  let latestFile: string | null = null
  let latestLine: number | null = null
  let latestTimestamp = 0

  for (const event of events) {
    let stack = event.sourceStack
    if (!stack && event.type === 'backend-span' && event.data) {
      const bd = event.data as { sourceStack?: string }
      if (typeof bd.sourceStack === 'string') stack = bd.sourceStack
    }
    const frames = parseAllUserFrames(stack)
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi]
      let fileData = files.get(frame.filePath)
      if (!fileData) {
        fileData = {
          filePath: frame.filePath,
          displayPath: extractDisplayPath(frame.filePath),
          lines: new Map()
        }
        files.set(frame.filePath, fileData)
      }

      const existing = fileData.lines.get(frame.line)
      if (existing) {
        existing.count++
        existing.lastTimestamp = Math.max(existing.lastTimestamp, event.timestamp)
        existing.isLatest = false // reset, set below
      } else {
        fileData.lines.set(frame.line, {
          count: 1,
          lastTimestamp: event.timestamp,
          isLatest: false
        })
      }

      // Track the latest event's primary (first) frame
      if (fi === 0 && event.timestamp >= latestTimestamp) {
        latestTimestamp = event.timestamp
        latestFile = frame.filePath
        latestLine = frame.line
      }
    }
  }

  // Mark the latest line
  if (latestFile && latestLine !== null) {
    const fileData = files.get(latestFile)
    if (fileData) {
      const hit = fileData.lines.get(latestLine)
      if (hit) hit.isLatest = true
    }
  }

  return { traceId, files, latestFile, latestLine, seq: ++globalSeq }
}

export function useSourceHitMap(): SourceHitMap {
  const [currentTraceHits, setCurrentTraceHits] = useState<TraceHitData | null>(null)
  const [allTraceHits, setAllTraceHits] = useState<Map<string, TraceHitData>>(new Map())
  const [sourceCache, setSourceCache] = useState<Map<string, SourceFileCache>>(new Map())
  const [activeFile, setActiveFile] = useState<string | null>(null)

  const allTraceHitsRef = useRef<Map<string, TraceHitData>>(new Map())
  const sourceCacheRef = useRef<Map<string, SourceFileCache>>(new Map())
  const currentTraceIdRef = useRef<string | null>(null)
  const traceEventsRef = useRef<Map<string, CapturedEvent[]>>(new Map())
  const fetchedRef = useRef<Set<string>>(new Set())

  const fetchSourceIfNeeded = useCallback((filePath: string) => {
    if (fetchedRef.current.has(filePath)) return
    fetchedRef.current.add(filePath)

    const cache = new Map(sourceCacheRef.current)
    cache.set(filePath, { content: null, loading: true, error: null })
    sourceCacheRef.current = cache
    setSourceCache(cache)

    window.flowlens.fetchSource(filePath).then((result) => {
      const updated = new Map(sourceCacheRef.current)
      if (result.error !== undefined) {
        updated.set(filePath, { content: null, loading: false, error: result.error })
      } else {
        updated.set(filePath, {
          content: result.content!,
          loading: false,
          error: null,
          lineMap: result.lineMap ?? null
        })
      }
      sourceCacheRef.current = updated
      setSourceCache(updated)
    })
  }, [])

  const processEvent = useCallback((event: CapturedEvent) => {
    const { traceId } = event

    const eventsMap = traceEventsRef.current
    if (!eventsMap.has(traceId)) {
      eventsMap.set(traceId, [])
    }
    eventsMap.get(traceId)!.push(event)

    // Recompute hits for this trace
    const traceEvents = eventsMap.get(traceId)!
    const hits = computeTraceHits(traceId, traceEvents)

    // Fetch source for any new files
    for (const filePath of hits.files.keys()) {
      fetchSourceIfNeeded(filePath)
    }

    // Always store in the all-traces map
    allTraceHitsRef.current = new Map(allTraceHitsRef.current)
    allTraceHitsRef.current.set(traceId, hits)
    setAllTraceHits(allTraceHitsRef.current)

    // Update current trace display ONLY if this trace has source-bearing events.
    // This prevents the flash-to-empty when a DOM click event arrives (no user frames)
    // before the console.log/fetch events that DO have user frames.
    if (hits.files.size > 0) {
      currentTraceIdRef.current = traceId
      setCurrentTraceHits(hits)
      setActiveFile(hits.latestFile)
    }
  }, [fetchSourceIfNeeded])

  useEffect(() => {
    // Load existing traces
    window.flowlens.getAllTraces().then((traces) => {
      for (const t of traces) {
        for (const ev of t.events) {
          const eventsMap = traceEventsRef.current
          if (!eventsMap.has(ev.traceId)) {
            eventsMap.set(ev.traceId, [])
          }
          eventsMap.get(ev.traceId)!.push(ev)
        }
      }

      // Compute hits for all traces
      const allHits = new Map<string, TraceHitData>()
      for (const [traceId, events] of traceEventsRef.current) {
        const hits = computeTraceHits(traceId, events)
        allHits.set(traceId, hits)
        for (const fp of hits.files.keys()) {
          fetchSourceIfNeeded(fp)
        }
      }
      allTraceHitsRef.current = allHits
      setAllTraceHits(allHits)

      // Set current trace to most recent that has source files
      if (traces.length > 0) {
        for (const t of traces) {
          const hits = allHits.get(t.id)
          if (hits && hits.files.size > 0) {
            currentTraceIdRef.current = t.id
            setCurrentTraceHits(hits)
            setActiveFile(hits.latestFile)
            break
          }
        }
      }
    })

    const unsubscribe = window.flowlens.onTraceEvent(processEvent)
    return unsubscribe
  }, [processEvent, fetchSourceIfNeeded])

  // File order for current trace
  const currentFileOrder = currentTraceHits
    ? Array.from(currentTraceHits.files.keys())
    : []

  return {
    currentTraceHits,
    allTraceHits,
    sourceCache,
    currentFileOrder,
    activeFile,
    setActiveFile,
    fetchSourceIfNeeded
  }
}
