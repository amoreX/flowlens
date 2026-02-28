import { useState, useEffect, useRef, useMemo } from 'react'
import type { SourceHitMap, SourceFileCache } from '../hooks/useSourceHitMap'
import type { CapturedEvent, SourceLocation } from '../types/events'
import { parseAllUserFrames, extractDisplayPath } from '../utils/stack-parser'
import { tokenizeLine } from '../utils/syntax'
import '../assets/source-panel.css'

interface SourceCodePanelProps {
  hitMap: SourceHitMap
  focusedEvent: CapturedEvent | null
  focusedTraceEvents?: CapturedEvent[]
  onNavigateToTraceEvent?: (eventId: string) => void
}

function parseEventFrames(event: CapturedEvent): SourceLocation[] {
  let stack = event.sourceStack
  // For backend-span events, sourceStack may be embedded in data (IPC serialization fallback)
  if (!stack && event.type === 'backend-span' && event.data) {
    const bd = event.data as { sourceStack?: string }
    if (typeof bd.sourceStack === 'string') {
      stack = bd.sourceStack
    }
  }
  return parseAllUserFrames(stack)
}

/** Translate a transformed line number to an original line using the source map */
function mapLine(line: number, lineMap: Record<number, number> | null | undefined): number {
  if (!lineMap) return line
  return lineMap[line] ?? line
}

/** Translate a hit map keyed by transformed lines to one keyed by original lines */
function translateHitLines<T extends { count: number }>(
  lines: Map<number, T>,
  lineMap: Record<number, number> | null | undefined
): Map<number, T> {
  if (!lineMap) return lines
  const out = new Map<number, T>()
  for (const [line, data] of lines) {
    const origLine = lineMap[line] ?? line
    const existing = out.get(origLine)
    if (existing) {
      existing.count += data.count
      for (const k of Object.keys(data) as (keyof T)[]) {
        if (typeof data[k] === 'boolean' && data[k]) {
          (existing as Record<string, unknown>)[k as string] = true
        }
      }
    } else {
      out.set(origLine, { ...data })
    }
  }
  return out
}

export function SourceCodePanel({
  hitMap,
  focusedEvent,
  focusedTraceEvents,
  onNavigateToTraceEvent
}: SourceCodePanelProps) {
  if (focusedEvent && focusedTraceEvents) {
    return (
      <FocusedSourceView
        event={focusedEvent}
        traceEvents={focusedTraceEvents}
        sourceCache={hitMap.sourceCache}
        fetchSourceIfNeeded={hitMap.fetchSourceIfNeeded}
        onNavigateToTraceEvent={onNavigateToTraceEvent}
      />
    )
  }
  return <LiveSourceView hitMap={hitMap} />
}

// ── Live Mode: per-trace highlights ──────────────────────────────────

function LiveSourceView({ hitMap }: { hitMap: SourceHitMap }) {
  const { currentTraceHits, sourceCache, currentFileOrder, activeFile, setActiveFile } = hitMap
  const codeAreaRef = useRef<HTMLDivElement>(null)
  const lastScrollTarget = useRef<string | null>(null)

  useEffect(() => {
    if (!currentTraceHits?.latestFile || !currentTraceHits.latestLine) return

    const lineMap = sourceCache.get(currentTraceHits.latestFile)?.lineMap
    const targetLine = mapLine(currentTraceHits.latestLine, lineMap)
    const scrollKey = `${currentTraceHits.latestFile}:${targetLine}`
    if (scrollKey === lastScrollTarget.current) return
    lastScrollTarget.current = scrollKey

    if (activeFile !== currentTraceHits.latestFile) return

    requestAnimationFrame(() => {
      if (!codeAreaRef.current) return
      const el = codeAreaRef.current.querySelector(`[data-line="${targetLine}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [currentTraceHits, activeFile, sourceCache])

  const hasFiles = currentTraceHits && currentFileOrder.length > 0
  const currentFileData = hasFiles && activeFile ? currentTraceHits.files.get(activeFile) : null
  const currentSource = activeFile ? sourceCache.get(activeFile) : null

  const hitLines = currentFileData
    ? translateHitLines(currentFileData.lines, currentSource?.lineMap)
    : null

  return (
    <div className="source-panel">
      <div className="source-file-tabs">
        {hasFiles && currentFileOrder.map((fp) => {
          const fileData = currentTraceHits.files.get(fp)!
          return (
            <button
              key={fp}
              className={`source-file-tab${fp === activeFile ? ' active' : ''}`}
              onClick={() => setActiveFile(fp)}
              title={fp}
            >
              {fileData.displayPath}
            </button>
          )
        })}
      </div>

      {!hasFiles && (
        <div className="source-panel-status">
          <div className="source-panel-status-icon">{'{}'}</div>
          <div className="source-panel-status-text">
            Source code will appear here as you interact with the target app. Lines will light up in real-time.
          </div>
        </div>
      )}
      {currentSource?.loading && (
        <div className="source-panel-loading">Loading source...</div>
      )}
      {currentSource?.error && (
        <div className="source-panel-error">{currentSource.error}</div>
      )}
      {currentSource?.content && hitLines && (
        <SourceCodeContent
          content={currentSource.content}
          hitLines={hitLines}
          seq={currentTraceHits!.seq}
          codeAreaRef={codeAreaRef}
        />
      )}
    </div>
  )
}

// ── Focus Mode: per-trace all-event highlights with call stack ───────

interface FocusedSourceViewProps {
  event: CapturedEvent
  traceEvents: CapturedEvent[]
  sourceCache: Map<string, SourceFileCache>
  fetchSourceIfNeeded: (filePath: string) => void
  onNavigateToTraceEvent?: (eventId: string) => void
}

interface TraceHighlights {
  files: Map<string, { displayPath: string; lines: Map<number, { count: number; isCurrentEvent: boolean; isLatest: boolean }> }>
  fileOrder: string[]
}

function computeTraceHighlights(
  traceEvents: CapturedEvent[],
  currentEventId: string
): TraceHighlights {
  const files = new Map<string, { displayPath: string; lines: Map<number, { count: number; isCurrentEvent: boolean; isLatest: boolean }> }>()
  const fileLastHit = new Map<string, number>()
  let latestFile: string | null = null
  let latestLine: number | null = null
  let latestTs = 0

  for (const ev of traceEvents) {
    const frames = parseEventFrames(ev)
    const isCurrent = ev.id === currentEventId

    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi]
      let fileData = files.get(frame.filePath)
      if (!fileData) {
        fileData = {
          displayPath: extractDisplayPath(frame.filePath),
          lines: new Map()
        }
        files.set(frame.filePath, fileData)
      }
      fileLastHit.set(frame.filePath, Math.max(fileLastHit.get(frame.filePath) ?? 0, ev.timestamp))

      const existing = fileData.lines.get(frame.line)
      if (existing) {
        existing.count++
        if (isCurrent) existing.isCurrentEvent = true
      } else {
        fileData.lines.set(frame.line, {
          count: 1,
          isCurrentEvent: isCurrent,
          isLatest: false
        })
      }

      if (isCurrent && fi === 0 && ev.timestamp >= latestTs) {
        latestTs = ev.timestamp
        latestFile = frame.filePath
        latestLine = frame.line
      }
    }
  }

  if (latestFile && latestLine !== null) {
    const fd = files.get(latestFile)
    const hit = fd?.lines.get(latestLine)
    if (hit) hit.isLatest = true
  }

  const fileOrder = Array.from(files.keys()).sort((a, b) =>
    (fileLastHit.get(b) ?? 0) - (fileLastHit.get(a) ?? 0)
  )

  return { files, fileOrder }
}

function findNearestEventForFile(
  traceEvents: CapturedEvent[],
  currentEventId: string,
  filePath: string
): CapturedEvent | null {
  if (traceEvents.length === 0) return null
  const currentIndex = traceEvents.findIndex((ev) => ev.id === currentEventId)
  if (currentIndex < 0) return null

  // Prefer nearest event in either direction so tab clicks feel predictable while stepping.
  for (let distance = 0; distance < traceEvents.length; distance++) {
    const prev = currentIndex - distance
    if (prev >= 0) {
      const frames = parseEventFrames(traceEvents[prev])
      if (frames.some((f) => f.filePath === filePath)) return traceEvents[prev]
    }
    const next = currentIndex + distance
    if (next < traceEvents.length && next !== prev) {
      const frames = parseEventFrames(traceEvents[next])
      if (frames.some((f) => f.filePath === filePath)) return traceEvents[next]
    }
  }

  return null
}

function FocusedSourceView({
  event,
  traceEvents,
  sourceCache,
  fetchSourceIfNeeded,
  onNavigateToTraceEvent
}: FocusedSourceViewProps) {
  const frames = useMemo(() => parseEventFrames(event), [event.id])
  const [activeFrameIndex, setActiveFrameIndex] = useState(0)
  const [fileOverride, setFileOverride] = useState<string | null>(null)
  const codeAreaRef = useRef<HTMLDivElement>(null)
  const [callStackOpen, setCallStackOpen] = useState(true)

  const [trackedEventId, setTrackedEventId] = useState(event.id)
  if (event.id !== trackedEventId) {
    setTrackedEventId(event.id)
    setActiveFrameIndex(0)
    setFileOverride(null)
  }

  const effectiveFrameIndex = event.id === trackedEventId ? activeFrameIndex : 0

  const highlights = useMemo(
    () => computeTraceHighlights(traceEvents, event.id),
    [traceEvents, event.id]
  )

  // Build a stable, deduplicated file tab list from both highlights and current event frames
  const tabFiles = useMemo(() => {
    const seen = new Set<string>()
    const result: { filePath: string; displayPath: string }[] = []

    for (const fp of highlights.fileOrder) {
      if (!seen.has(fp)) {
        seen.add(fp)
        const fd = highlights.files.get(fp)
        result.push({ filePath: fp, displayPath: fd?.displayPath ?? extractDisplayPath(fp) })
      }
    }
    for (const frame of frames) {
      if (!seen.has(frame.filePath)) {
        seen.add(frame.filePath)
        result.push({ filePath: frame.filePath, displayPath: extractDisplayPath(frame.filePath) })
      }
    }
    return result
  }, [highlights, frames])

  const activeFrame = frames[effectiveFrameIndex] as SourceLocation | undefined

  const viewingFile = fileOverride
    ?? activeFrame?.filePath
    ?? frames[0]?.filePath
    ?? highlights.fileOrder[0]
    ?? null

  useEffect(() => {
    for (const fp of highlights.fileOrder) {
      fetchSourceIfNeeded(fp)
    }
  }, [highlights.fileOrder, fetchSourceIfNeeded])

  useEffect(() => {
    if (viewingFile) {
      fetchSourceIfNeeded(viewingFile)
    }
  }, [viewingFile, fetchSourceIfNeeded])

  // Scroll to target line (translated via source map)
  useEffect(() => {
    if (!activeFrame) return
    const cached = sourceCache.get(activeFrame.filePath)
    if (!cached?.content) return

    const targetLine = mapLine(activeFrame.line, cached.lineMap)
    requestAnimationFrame(() => {
      if (!codeAreaRef.current) return
      const el = codeAreaRef.current.querySelector(`[data-line="${targetLine}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [activeFrame, sourceCache])

  if (tabFiles.length === 0) {
    return (
      <div className="source-panel">
        <div className="source-panel-status">
          <div className="source-panel-status-icon">?</div>
          <div className="source-panel-status-text">
            No source location available for this event.
          </div>
        </div>
      </div>
    )
  }

  const currentSource = viewingFile ? sourceCache.get(viewingFile) : null
  const fileHighlights = viewingFile ? highlights.files.get(viewingFile) : null
  const lineMap = currentSource?.lineMap

  const translatedTraceLines = fileHighlights
    ? translateHitLines(fileHighlights.lines, lineMap)
    : null
  const translatedFocusLine = activeFrame ? mapLine(activeFrame.line, lineMap) : null

  return (
    <div className="source-panel">
      <div className="source-file-tabs">
        {tabFiles.map(({ filePath: fp, displayPath }) => (
          <button
            key={fp}
            className={`source-file-tab${fp === viewingFile ? ' active' : ''}`}
            onClick={() => {
              const idx = frames.findIndex((f) => f.filePath === fp)
              if (idx >= 0) {
                setActiveFrameIndex(idx)
                setFileOverride(null)
                return
              }

              const nearestEvent = findNearestEventForFile(traceEvents, event.id, fp)
              if (nearestEvent && onNavigateToTraceEvent) {
                onNavigateToTraceEvent(nearestEvent.id)
                setFileOverride(fp)
              } else {
                setFileOverride(fp)
              }
            }}
            title={fp}
          >
            {displayPath}
          </button>
        ))}
      </div>

      {currentSource?.loading && <div className="source-panel-loading">Loading source...</div>}
      {currentSource?.error && <div className="source-panel-error">{currentSource.error}</div>}
      {currentSource?.content && (
        <FocusedSourceContent
          content={currentSource.content}
          focusLine={translatedFocusLine}
          traceLines={translatedTraceLines}
          eventId={event.id}
          codeAreaRef={codeAreaRef}
        />
      )}

      {frames.length > 0 && (
        <div className="call-stack-bottom">
          <button
            className="call-stack-toggle"
            onClick={() => setCallStackOpen((v) => !v)}
          >
            <span className="call-stack-toggle-icon">{callStackOpen ? '\u25BC' : '\u25B6'}</span>
            <span className="call-stack-toggle-label">Call Stack</span>
            <span className="call-stack-count">{frames.length}</span>
          </button>
          {callStackOpen && (
            <div className="call-stack-frames">
              {frames.map((frame, i) => {
                const frameLM = sourceCache.get(frame.filePath)?.lineMap
                const displayLine = mapLine(frame.line, frameLM)
                return (
                  <button
                    key={i}
                    className={`call-stack-frame${i === effectiveFrameIndex ? ' active' : ''}`}
                    onClick={() => {
                      setActiveFrameIndex(i)
                      setFileOverride(null)
                    }}
                  >
                    <span className="call-stack-fn">{frame.functionName || '(anonymous)'}</span>
                    <span className="call-stack-loc">
                      {extractDisplayPath(frame.filePath)}:{displayLine}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared source rendering ──────────────────────────────────────────

interface SourceCodeContentProps {
  content: string
  hitLines: Map<number, { count: number; isLatest: boolean }>
  seq: number
  codeAreaRef: React.RefObject<HTMLDivElement | null>
}

function SourceCodeContent({ content, hitLines, seq, codeAreaRef }: SourceCodeContentProps) {
  const allLines = content.split('\n')

  return (
    <div className="source-code-area" ref={codeAreaRef}>
      <div className="source-code-lines">
        {allLines.map((lineContent, i) => {
          const lineNum = i + 1
          const hit = hitLines.get(lineNum)
          let hitClass = ''
          if (hit) {
            hitClass = hit.isLatest ? ' hit-latest' : ' hit-trace'
          }

          const key = hit ? `${lineNum}-${seq}` : lineNum

          return (
            <div key={key} data-line={lineNum} className={`source-panel-line${hitClass}`}>
              <span className="source-panel-line-number">{lineNum}</span>
              <code
                className="source-panel-line-content"
                dangerouslySetInnerHTML={{ __html: tokenizeLine(lineContent) }}
              />
              {hit && hit.count > 1 && (
                <span className="source-hit-badge">{hit.count > 99 ? '99+' : hit.count}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface FocusedSourceContentProps {
  content: string
  focusLine: number | null
  traceLines: Map<number, { count: number; isCurrentEvent: boolean; isLatest: boolean }> | null
  eventId: string
  codeAreaRef: React.RefObject<HTMLDivElement | null>
}

function FocusedSourceContent({ content, focusLine, traceLines, eventId, codeAreaRef }: FocusedSourceContentProps) {
  const allLines = content.split('\n')

  return (
    <div className="source-code-area" ref={codeAreaRef}>
      <div className="source-code-lines">
        {allLines.map((lineContent, i) => {
          const lineNum = i + 1
          const traceHit = traceLines?.get(lineNum)
          const isFocus = lineNum === focusLine

          let hitClass = ''
          if (isFocus) {
            hitClass = ' hit-nav-latest'
          } else if (traceHit?.isCurrentEvent) {
            hitClass = ' hit-nav-current'
          } else if (traceHit) {
            hitClass = ' hit-trace'
          }

          const key = hitClass ? `${lineNum}-${eventId}` : lineNum

          return (
            <div key={key} data-line={lineNum} className={`source-panel-line${hitClass}`}>
              <span className="source-panel-line-number">{lineNum}</span>
              <code
                className="source-panel-line-content"
                dangerouslySetInnerHTML={{ __html: tokenizeLine(lineContent) }}
              />
              {traceHit && traceHit.count > 1 && (
                <span className="source-hit-badge">{traceHit.count > 99 ? '99+' : traceHit.count}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
