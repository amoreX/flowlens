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
}

export function SourceCodePanel({ hitMap, focusedEvent, focusedTraceEvents }: SourceCodePanelProps) {
  // Check if the focused trace has any events with source frames
  const focusedHasSource = useMemo(() => {
    if (!focusedTraceEvents) return false
    return focusedTraceEvents.some((ev) => parseAllUserFrames(ev.sourceStack).length > 0)
  }, [focusedTraceEvents])

  if (focusedEvent && focusedTraceEvents && focusedHasSource) {
    return (
      <FocusedSourceView
        event={focusedEvent}
        traceEvents={focusedTraceEvents}
        sourceCache={hitMap.sourceCache}
      />
    )
  }
  // Fall back to live mode (shows current hit-map even when focused trace has no source)
  return <LiveSourceView hitMap={hitMap} />
}

// ── Live Mode: per-trace highlights ──────────────────────────────────

function LiveSourceView({ hitMap }: { hitMap: SourceHitMap }) {
  const { currentTraceHits, sourceCache, currentFileOrder, activeFile, setActiveFile } = hitMap
  const codeAreaRef = useRef<HTMLDivElement>(null)
  const lastScrollTarget = useRef<string | null>(null)

  // Auto-scroll to latest hit line
  useEffect(() => {
    if (!currentTraceHits?.latestFile || !currentTraceHits.latestLine) return
    const scrollKey = `${currentTraceHits.latestFile}:${currentTraceHits.latestLine}`
    if (scrollKey === lastScrollTarget.current) return
    lastScrollTarget.current = scrollKey

    // Only scroll if we're viewing the file that has the latest hit
    if (activeFile !== currentTraceHits.latestFile) return

    requestAnimationFrame(() => {
      if (!codeAreaRef.current) return
      const el = codeAreaRef.current.querySelector(`[data-line="${currentTraceHits.latestLine}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [currentTraceHits, activeFile])

  if (!currentTraceHits || currentFileOrder.length === 0) {
    return (
      <div className="source-panel">
        <div className="source-panel-status">
          <div className="source-panel-status-icon">{'{}'}</div>
          <div className="source-panel-status-text">
            Source code will appear here as you interact with the target app. Lines will light up in real-time.
          </div>
        </div>
      </div>
    )
  }

  const currentFileData = activeFile ? currentTraceHits.files.get(activeFile) : null
  const currentSource = activeFile ? sourceCache.get(activeFile) : null

  return (
    <div className="source-panel">
      <div className="source-file-tabs">
        {currentFileOrder.map((fp) => {
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

      {currentSource?.loading && (
        <div className="source-panel-loading">Loading source...</div>
      )}
      {currentSource?.error && (
        <div className="source-panel-error">{currentSource.error}</div>
      )}
      {currentSource?.content && currentFileData && (
        <SourceCodeContent
          content={currentSource.content}
          hitLines={currentFileData.lines}
          seq={currentTraceHits.seq}
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
}

/** Collected highlight data for all events in a trace */
interface TraceHighlights {
  /** All unique files referenced */
  files: Map<string, { displayPath: string; lines: Map<number, { count: number; isCurrentEvent: boolean; isLatest: boolean }> }>
  /** File order (most recently referenced first) */
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
    const frames = parseAllUserFrames(ev.sourceStack)
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
        // Upgrade to current event if this event matches
        if (isCurrent) existing.isCurrentEvent = true
      } else {
        fileData.lines.set(frame.line, {
          count: 1,
          isCurrentEvent: isCurrent,
          isLatest: false
        })
      }

      // Track the overall latest line (from the current event's first frame)
      if (isCurrent && fi === 0 && ev.timestamp >= latestTs) {
        latestTs = ev.timestamp
        latestFile = frame.filePath
        latestLine = frame.line
      }
    }
  }

  // Mark latest
  if (latestFile && latestLine !== null) {
    const fd = files.get(latestFile)
    const hit = fd?.lines.get(latestLine)
    if (hit) hit.isLatest = true
  }

  // Sort files by most recently hit
  const fileOrder = Array.from(files.keys()).sort((a, b) =>
    (fileLastHit.get(b) ?? 0) - (fileLastHit.get(a) ?? 0)
  )

  return { files, fileOrder }
}

function FocusedSourceView({ event, traceEvents, sourceCache }: FocusedSourceViewProps) {
  // Call stack frames for the current event
  const frames = useMemo(() => parseAllUserFrames(event.sourceStack), [event.id])
  const [activeFrameIndex, setActiveFrameIndex] = useState(0)
  const codeAreaRef = useRef<HTMLDivElement>(null)

  // Compute highlights for ALL events in the trace
  const highlights = useMemo(
    () => computeTraceHighlights(traceEvents, event.id),
    [traceEvents, event.id]
  )

  const activeFrame = frames[activeFrameIndex] as SourceLocation | undefined

  // Which file are we viewing?
  const viewingFile = activeFrame?.filePath ?? highlights.fileOrder[0] ?? null

  // Fetch source if not cached
  useEffect(() => {
    if (!viewingFile) return
    const cached = sourceCache.get(viewingFile)
    if (!cached && viewingFile) {
      // Source will be fetched by useSourceHitMap when it processes events
      // But in case it hasn't yet, trigger a fetch
      window.flowlens.fetchSource(viewingFile)
    }
  }, [viewingFile, sourceCache])

  // Reset frame index when event changes
  useEffect(() => {
    setActiveFrameIndex(0)
  }, [event.id])

  // Scroll to target line
  useEffect(() => {
    if (!activeFrame) return
    const cached = sourceCache.get(activeFrame.filePath)
    if (!cached?.content) return

    requestAnimationFrame(() => {
      if (!codeAreaRef.current) return
      const el = codeAreaRef.current.querySelector(`[data-line="${activeFrame.line}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [activeFrame, sourceCache])

  if (frames.length === 0 && highlights.fileOrder.length === 0) {
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

  return (
    <div className="source-panel">
      {/* File tabs — all files in trace */}
      <div className="source-file-tabs">
        {highlights.fileOrder.map((fp) => {
          const fd = highlights.files.get(fp)!
          return (
            <button
              key={fp}
              className={`source-file-tab${fp === viewingFile ? ' active' : ''}`}
              onClick={() => {
                // Find a frame in this file if possible
                const idx = frames.findIndex((f) => f.filePath === fp)
                if (idx >= 0) setActiveFrameIndex(idx)
                else setActiveFrameIndex(-1) // no frame, just view file
              }}
              title={fp}
            >
              {fd.displayPath}
            </button>
          )
        })}
      </div>

      {/* Call Stack for current event */}
      {frames.length > 0 && (
        <div className="call-stack-panel">
          <div className="call-stack-title">Call Stack</div>
          <div className="call-stack-frames">
            {frames.map((frame, i) => (
              <button
                key={i}
                className={`call-stack-frame${i === activeFrameIndex ? ' active' : ''}`}
                onClick={() => setActiveFrameIndex(i)}
              >
                <span className="call-stack-fn">{frame.functionName || '(anonymous)'}</span>
                <span className="call-stack-loc">
                  {extractDisplayPath(frame.filePath)}:{frame.line}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Source code */}
      {currentSource?.loading && <div className="source-panel-loading">Loading source...</div>}
      {currentSource?.error && <div className="source-panel-error">{currentSource.error}</div>}
      {currentSource?.content && (
        <FocusedSourceContent
          content={currentSource.content}
          focusLine={activeFrame?.line ?? null}
          traceLines={fileHighlights?.lines ?? null}
          eventId={event.id}
          codeAreaRef={codeAreaRef}
        />
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
      {allLines.map((lineContent, i) => {
        const lineNum = i + 1
        const hit = hitLines.get(lineNum)
        let hitClass = ''
        if (hit) {
          hitClass = hit.isLatest ? ' hit-latest' : ' hit-trace'
        }

        // Use seq in key for highlighted lines so React recreates the DOM element,
        // replaying the CSS pulse animation even when the same line is re-highlighted
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
      {allLines.map((lineContent, i) => {
        const lineNum = i + 1
        const traceHit = traceLines?.get(lineNum)
        const isFocus = lineNum === focusLine

        let hitClass = ''
        if (isFocus) {
          hitClass = ' hit-latest'
        } else if (traceHit?.isCurrentEvent) {
          hitClass = ' hit-current-event'
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
  )
}
