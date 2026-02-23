import { useState, useEffect, useRef, useCallback } from 'react'
import type { CapturedEvent } from '../types/events'
import { parseUserSourceLocation, extractDisplayPath } from '../utils/stack-parser'

export interface LineHit {
  count: number
  lastTimestamp: number
}

export interface FileHitData {
  filePath: string
  displayPath: string
  lines: Map<number, LineHit>
  lastHitTimestamp: number
  content: string | null
  loading: boolean
  error: string | null
}

export interface SourceHitMap {
  files: Map<string, FileHitData>
  fileOrder: string[]
  activeFile: string | null
  setActiveFile: (filePath: string) => void
  lastHitLine: number | null
}

export function useSourceHitMap(): SourceHitMap {
  const [files, setFiles] = useState<Map<string, FileHitData>>(new Map())
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [lastHitLine, setLastHitLine] = useState<number | null>(null)
  const filesRef = useRef<Map<string, FileHitData>>(new Map())
  const fetchedRef = useRef<Set<string>>(new Set())

  const processEvent = useCallback((event: CapturedEvent) => {
    const location = parseUserSourceLocation(event.sourceStack)
    if (!location) return

    const { filePath, line } = location
    const map = filesRef.current
    let fileData = map.get(filePath)

    if (!fileData) {
      fileData = {
        filePath,
        displayPath: extractDisplayPath(filePath),
        lines: new Map(),
        lastHitTimestamp: event.timestamp,
        content: null,
        loading: false,
        error: null
      }
      map.set(filePath, fileData)

      // Fetch source content
      if (!fetchedRef.current.has(filePath)) {
        fetchedRef.current.add(filePath)
        fileData.loading = true

        window.flowlens.fetchSource(filePath).then((result) => {
          const current = filesRef.current.get(filePath)
          if (!current) return

          if (result.error !== undefined) {
            current.error = result.error
            current.loading = false
          } else {
            current.content = result.content!
            current.loading = false
          }
          setFiles(new Map(filesRef.current))
        })
      }
    }

    // Update hit count
    const existing = fileData.lines.get(line)
    if (existing) {
      existing.count++
      existing.lastTimestamp = event.timestamp
    } else {
      fileData.lines.set(line, { count: 1, lastTimestamp: event.timestamp })
    }
    fileData.lastHitTimestamp = event.timestamp

    filesRef.current = new Map(map)
    setFiles(filesRef.current)
    setActiveFile(filePath)
    setLastHitLine(line)
  }, [])

  useEffect(() => {
    // Process existing traces
    window.flowlens.getAllTraces().then((traces) => {
      for (const t of traces) {
        for (const ev of t.events) {
          processEvent(ev)
        }
      }
    })

    // Subscribe to live events
    const unsubscribe = window.flowlens.onTraceEvent(processEvent)
    return unsubscribe
  }, [processEvent])

  // Compute file order sorted by most recently hit
  const fileOrder = Array.from(files.keys()).sort((a, b) => {
    const fa = files.get(a)!
    const fb = files.get(b)!
    return fb.lastHitTimestamp - fa.lastHitTimestamp
  })

  return { files, fileOrder, activeFile, setActiveFile, lastHitLine }
}
