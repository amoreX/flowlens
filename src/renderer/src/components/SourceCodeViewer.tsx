import { useState, useEffect, useRef } from 'react'
import type { CapturedEvent, SourceLocation, SourceResponse } from '../types/events'
import { parseUserSourceLocation, extractDisplayPath } from '../utils/stack-parser'
import { tokenizeLine } from '../utils/syntax'
import '../assets/source-viewer.css'

interface SourceCodeViewerProps {
  event: CapturedEvent
}

function getEffectiveStack(event: CapturedEvent): string | undefined {
  if (event.sourceStack) return event.sourceStack
  if (event.type === 'backend-span' && event.data) {
    const bd = event.data as { sourceStack?: string }
    if (typeof bd.sourceStack === 'string') return bd.sourceStack
  }
  return undefined
}

type ViewerState =
  | { status: 'no-location' }
  | { status: 'loading'; location: SourceLocation }
  | { status: 'error'; location: SourceLocation; error: string }
  | { status: 'loaded'; location: SourceLocation; content: string; lineMap?: Record<number, number> }

const CONTEXT_LINES = 10

export function SourceCodeViewer({ event }: SourceCodeViewerProps) {
  const [state, setState] = useState<ViewerState>({ status: 'no-location' })
  const [expanded, setExpanded] = useState(true)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stack = getEffectiveStack(event)
    const location = parseUserSourceLocation(stack)
    if (!location) {
      setState({ status: 'no-location' })
      return
    }

    setState({ status: 'loading', location })

    window.flowlens.fetchSource(location.filePath).then((result: SourceResponse) => {
      if (result.error !== undefined) {
        setState({ status: 'error', location, error: result.error })
      } else {
        setState({
          status: 'loaded',
          location,
          content: result.content!,
          lineMap: result.lineMap
        })
      }
    })
  }, [event.id])

  useEffect(() => {
    if (state.status === 'loaded' && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [state])

  if (state.status === 'no-location') {
    return (
      <div className="source-viewer-section">
        <div className="source-viewer-header">
          <span className="source-viewer-title">Source</span>
          <span className="source-viewer-na">No source location</span>
        </div>
      </div>
    )
  }

  const displayPath = extractDisplayPath(state.location.filePath)
  const mappedLine = state.status === 'loaded' && state.lineMap
    ? (state.lineMap[state.location.line] ?? state.location.line)
    : state.location.line

  return (
    <div className="source-viewer-section">
      <div className="source-viewer-header" onClick={() => setExpanded(!expanded)}>
        <span className={`source-viewer-chevron${expanded ? ' expanded' : ''}`}>&#9654;</span>
        <span className="source-viewer-title">Source</span>
        <span className="source-viewer-file" title={state.location.filePath}>
          {displayPath}:{mappedLine}
        </span>
      </div>

      {expanded && (
        <div className="source-viewer-body">
          {state.status === 'loading' && (
            <div className="source-viewer-loading">Loading source...</div>
          )}
          {state.status === 'error' && (
            <div className="source-viewer-error">{state.error}</div>
          )}
          {state.status === 'loaded' && (
            <SourceCodeBlock
              content={state.content}
              targetLine={mappedLine}
              highlightRef={highlightRef}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface SourceCodeBlockProps {
  content: string
  targetLine: number
  highlightRef: React.RefObject<HTMLDivElement | null>
}

function SourceCodeBlock({ content, targetLine, highlightRef }: SourceCodeBlockProps) {
  const lines = content.split('\n')
  const startLine = Math.max(1, targetLine - CONTEXT_LINES)
  const endLine = Math.min(lines.length, targetLine + CONTEXT_LINES)
  const visibleLines = lines.slice(startLine - 1, endLine)

  return (
    <div className="source-code-block">
      {visibleLines.map((lineContent, i) => {
        const lineNum = startLine + i
        const isTarget = lineNum === targetLine

        return (
          <div
            key={lineNum}
            ref={isTarget ? highlightRef : undefined}
            className={`source-line${isTarget ? ' source-line-highlight' : ''}`}
          >
            <span className="source-line-number">{lineNum}</span>
            <code
              className="source-line-content"
              dangerouslySetInnerHTML={{ __html: tokenizeLine(lineContent) }}
            />
          </div>
        )
      })}
    </div>
  )
}
