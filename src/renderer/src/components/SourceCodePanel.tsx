import { useState, useEffect, useRef, useMemo } from 'react'
import type { SourceHitMap } from '../hooks/useSourceHitMap'
import type { CapturedEvent, SourceLocation, SourceResponse } from '../types/events'
import { parseAllUserFrames, extractDisplayPath } from '../utils/stack-parser'
import { tokenizeLine } from '../utils/syntax'
import '../assets/source-panel.css'

interface SourceCodePanelProps {
  hitMap: SourceHitMap
  focusedEvent: CapturedEvent | null
}

// Lines hit within the last 2 seconds get the "recent" glow
const RECENT_THRESHOLD_MS = 2000

export function SourceCodePanel({ hitMap, focusedEvent }: SourceCodePanelProps) {
  if (focusedEvent) {
    return <FocusedSourceView event={focusedEvent} />
  }
  return <LiveSourceView hitMap={hitMap} />
}

// ── Live Mode (no event selected — hit map) ──────────────────────────

function LiveSourceView({ hitMap }: { hitMap: SourceHitMap }) {
  const { files, fileOrder, activeFile, setActiveFile, lastHitLine } = hitMap
  const codeAreaRef = useRef<HTMLDivElement>(null)
  const lastScrolledLine = useRef<number | null>(null)

  const currentFile = activeFile ? files.get(activeFile) : null

  // Auto-scroll to latest hit line
  useEffect(() => {
    if (!lastHitLine || lastHitLine === lastScrolledLine.current) return
    lastScrolledLine.current = lastHitLine

    requestAnimationFrame(() => {
      if (!codeAreaRef.current) return
      const el = codeAreaRef.current.querySelector(`[data-line="${lastHitLine}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [lastHitLine, activeFile])

  if (fileOrder.length === 0) {
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

  return (
    <div className="source-panel">
      <div className="source-file-tabs">
        {fileOrder.map((fp) => {
          const fileData = files.get(fp)!
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

      {currentFile && currentFile.loading && (
        <div className="source-panel-loading">Loading source...</div>
      )}
      {currentFile && currentFile.error && (
        <div className="source-panel-error">{currentFile.error}</div>
      )}
      {currentFile && currentFile.content && (
        <LiveSourceContent
          content={currentFile.content}
          hitLines={currentFile.lines}
          codeAreaRef={codeAreaRef}
        />
      )}
    </div>
  )
}

interface LiveSourceContentProps {
  content: string
  hitLines: Map<number, { count: number; lastTimestamp: number }>
  codeAreaRef: React.RefObject<HTMLDivElement | null>
}

function LiveSourceContent({ content, hitLines, codeAreaRef }: LiveSourceContentProps) {
  const allLines = content.split('\n')
  const now = Date.now()

  return (
    <div className="source-code-area" ref={codeAreaRef}>
      {allLines.map((lineContent, i) => {
        const lineNum = i + 1
        const hit = hitLines.get(lineNum)
        const isRecent = hit && (now - hit.lastTimestamp) < RECENT_THRESHOLD_MS
        const hitClass = hit ? (isRecent ? ' hit-recent' : ' hit-old') : ''

        return (
          <div
            key={lineNum}
            data-line={lineNum}
            className={`source-panel-line${hitClass}`}
          >
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

// ── Focus Mode (event selected — call stack navigation) ──────────────

function FocusedSourceView({ event }: { event: CapturedEvent }) {
  const frames = useMemo(() => parseAllUserFrames(event.sourceStack), [event.id])
  const [activeFrameIndex, setActiveFrameIndex] = useState(0)
  const [sourceContent, setSourceContent] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const codeAreaRef = useRef<HTMLDivElement>(null)

  const activeFrame = frames[activeFrameIndex] as SourceLocation | undefined

  // Reset frame index when event changes
  useEffect(() => {
    setActiveFrameIndex(0)
  }, [event.id])

  // Fetch source for active frame
  useEffect(() => {
    if (!activeFrame) {
      setSourceContent(null)
      setSourceError(null)
      return
    }

    setLoading(true)
    setSourceContent(null)
    setSourceError(null)

    window.flowlens.fetchSource(activeFrame.filePath).then((result: SourceResponse) => {
      if (result.error !== undefined) {
        setSourceError(result.error)
      } else {
        setSourceContent(result.content!)
      }
      setLoading(false)
    })
  }, [activeFrame?.filePath])

  // Scroll to target line
  useEffect(() => {
    if (!sourceContent || !activeFrame) return
    requestAnimationFrame(() => {
      if (!codeAreaRef.current) return
      const el = codeAreaRef.current.querySelector(`[data-line="${activeFrame.line}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [sourceContent, activeFrame?.line, activeFrame?.filePath])

  if (frames.length === 0) {
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

  return (
    <div className="source-panel">
      {/* File tab showing current file */}
      {activeFrame && (
        <div className="source-file-tabs">
          <span className="source-file-tab active">
            {extractDisplayPath(activeFrame.filePath)}:{activeFrame.line}
          </span>
        </div>
      )}

      {/* Call Stack */}
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

      {/* Source Code */}
      {loading && <div className="source-panel-loading">Loading source...</div>}
      {sourceError && <div className="source-panel-error">{sourceError}</div>}
      {sourceContent && activeFrame && (
        <FocusedSourceContent
          content={sourceContent}
          targetLine={activeFrame.line}
          codeAreaRef={codeAreaRef}
        />
      )}
    </div>
  )
}

interface FocusedSourceContentProps {
  content: string
  targetLine: number
  codeAreaRef: React.RefObject<HTMLDivElement | null>
}

function FocusedSourceContent({ content, targetLine, codeAreaRef }: FocusedSourceContentProps) {
  const allLines = content.split('\n')

  return (
    <div className="source-code-area" ref={codeAreaRef}>
      {allLines.map((lineContent, i) => {
        const lineNum = i + 1
        const isTarget = lineNum === targetLine

        return (
          <div
            key={lineNum}
            data-line={lineNum}
            className={`source-panel-line${isTarget ? ' focus-target' : ''}`}
          >
            <span className="source-panel-line-number">{lineNum}</span>
            <code
              className="source-panel-line-content"
              dangerouslySetInnerHTML={{ __html: tokenizeLine(lineContent) }}
            />
          </div>
        )
      })}
    </div>
  )
}
