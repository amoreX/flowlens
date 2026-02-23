import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTraceEvents } from '../hooks/useTraceEvents'
import { useConsoleEntries } from '../hooks/useConsoleEntries'
import { useSourceHitMap } from '../hooks/useSourceHitMap'
import { StatusBar } from '../components/StatusBar'
import { Timeline } from '../components/Timeline'
import { SourceCodePanel } from '../components/SourceCodePanel'
import { ConsolePanel } from '../components/ConsolePanel'
import { FlowNavigator } from '../components/FlowNavigator'
import { EventDetailPanel } from '../components/EventDetailPanel'
import { parseAllUserFrames } from '../utils/stack-parser'
import type { CapturedEvent } from '../types/events'
import '../assets/timeline.css'

interface TracePageProps {
  targetUrl: string
  onStop: () => void
}

export function TracePage({ targetUrl, onStop }: TracePageProps) {
  const { traces, eventCount, clearTraces } = useTraceEvents()
  const [selectedEvent, setSelectedEvent] = useState<CapturedEvent | null>(null)

  // Flow navigation state
  const [focusedTraceId, setFocusedTraceId] = useState<string | null>(null)
  const [focusedEventIndex, setFocusedEventIndex] = useState(0)

  // Console
  const consoleEntries = useConsoleEntries()
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)

  // Source hit map (live mode)
  const sourceHitMap = useSourceHitMap()

  // ── Resize state ──
  const [tracesWidth, setTracesWidth] = useState(280)
  const [consoleHeight, setConsoleHeight] = useState(180)
  const [dragging, setDragging] = useState<'v' | 'h' | null>(null)
  const tracePageRef = useRef<HTMLDivElement>(null)

  // Vertical resize (traces | source)
  const onVDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging('v')
    const startX = e.clientX
    const startW = tracesWidth

    const onMove = (me: MouseEvent): void => {
      const parent = tracePageRef.current
      if (!parent) return
      const parentRect = parent.getBoundingClientRect()
      const newW = Math.max(160, Math.min(parentRect.width - 160, startW + (me.clientX - startX)))
      setTracesWidth(newW)
    }
    const onUp = (): void => {
      setDragging(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [tracesWidth])

  // Horizontal resize (main | console)
  const onHDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging('h')
    const startY = e.clientY
    const startH = consoleHeight

    const onMove = (me: MouseEvent): void => {
      const newH = Math.max(60, Math.min(500, startH - (me.clientY - startY)))
      setConsoleHeight(newH)
    }
    const onUp = (): void => {
      setDragging(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [consoleHeight])

  // Prevent text selection while dragging
  useEffect(() => {
    if (dragging) {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = dragging === 'v' ? 'col-resize' : 'row-resize'
    } else {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [dragging])

  // Get the focused trace's events
  const focusedTrace = useMemo(() => {
    if (!focusedTraceId) return null
    return traces.find((t) => t.id === focusedTraceId) ?? null
  }, [focusedTraceId, traces])

  const focusedEvent = focusedTrace?.events[focusedEventIndex] ?? null

  const handleSelectEvent = useCallback((event: CapturedEvent) => {
    setSelectedEvent(event)
    setFocusedTraceId(event.traceId)
    const trace = traces.find((t) => t.id === event.traceId)
    if (trace) {
      const idx = trace.events.findIndex((e) => e.id === event.id)
      setFocusedEventIndex(idx >= 0 ? idx : 0)
    }
  }, [traces])

  const handlePrevEvent = useCallback(() => {
    if (focusedEventIndex > 0) {
      const newIdx = focusedEventIndex - 1
      setFocusedEventIndex(newIdx)
      if (focusedTrace && selectedEvent) {
        setSelectedEvent(focusedTrace.events[newIdx])
      }
    }
  }, [focusedEventIndex, focusedTrace, selectedEvent])

  const handleNextEvent = useCallback(() => {
    if (focusedTrace && focusedEventIndex < focusedTrace.events.length - 1) {
      const newIdx = focusedEventIndex + 1
      setFocusedEventIndex(newIdx)
      if (selectedEvent) setSelectedEvent(focusedTrace.events[newIdx])
    }
  }, [focusedEventIndex, focusedTrace, selectedEvent])

  const handleFocusTrace = useCallback((traceId: string) => {
    const trace = traces.find((t) => t.id === traceId)
    if (!trace || trace.events.length === 0) return
    setFocusedTraceId(traceId)

    // Pick the first event that has user source frames (skip DOM events with none)
    let bestIndex = 0
    for (let i = 0; i < trace.events.length; i++) {
      if (parseAllUserFrames(trace.events[i].sourceStack).length > 0) {
        bestIndex = i
        break
      }
    }

    setFocusedEventIndex(bestIndex)
    // Don't open event details — just focus the source
  }, [traces])

  const handleOpenTraceDetails = useCallback((traceId: string) => {
    const trace = traces.find((t) => t.id === traceId)
    if (!trace || trace.events.length === 0) return
    setSelectedEvent(trace.events[0])
  }, [traces])

  const handleCloseFlow = useCallback(() => {
    setFocusedTraceId(null)
    setFocusedEventIndex(0)
    setSelectedEvent(null)
  }, [])

  // Keyboard arrow navigation when a trace is focused
  useEffect(() => {
    if (!focusedTrace) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (focusedEventIndex > 0) {
          const newIdx = focusedEventIndex - 1
          setFocusedEventIndex(newIdx)
          // Only update detail panel if it's already open
          if (selectedEvent) setSelectedEvent(focusedTrace.events[newIdx])
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (focusedEventIndex < focusedTrace.events.length - 1) {
          const newIdx = focusedEventIndex + 1
          setFocusedEventIndex(newIdx)
          if (selectedEvent) setSelectedEvent(focusedTrace.events[newIdx])
        }
      } else if (e.key === 'Escape') {
        setFocusedTraceId(null)
        setFocusedEventIndex(0)
        setSelectedEvent(null)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [focusedTrace, focusedEventIndex, selectedEvent])

  return (
    <div className="trace-page" ref={tracePageRef}>
      <StatusBar url={targetUrl} eventCount={eventCount} onStop={onStop} />

      <div className="main-content">
        <div className="traces-column" style={{ width: tracesWidth }}>
          <Timeline
            traces={traces}
            selectedEventId={selectedEvent?.id ?? null}
            focusedEventId={focusedEvent?.id ?? null}
            onSelectEvent={handleSelectEvent}
            onFocusTrace={handleFocusTrace}
            onOpenTraceDetails={handleOpenTraceDetails}
            onClear={clearTraces}
          />
        </div>

        <div
          className={`resize-handle-v${dragging === 'v' ? ' dragging' : ''}`}
          onMouseDown={onVDragStart}
        />

        <div className="source-column">
          <SourceCodePanel
            hitMap={sourceHitMap}
            focusedEvent={focusedEvent}
            focusedTraceEvents={focusedTrace?.events}
          />
          {focusedTrace && (
            <FlowNavigator
              events={focusedTrace.events}
              currentIndex={focusedEventIndex}
              onPrev={handlePrevEvent}
              onNext={handleNextEvent}
              onClose={handleCloseFlow}
            />
          )}
        </div>
      </div>

      <div
        className={`resize-handle-h${dragging === 'h' ? ' dragging' : ''}`}
        onMouseDown={consoleCollapsed ? undefined : onHDragStart}
      />

      <div
        className={`console-section${consoleCollapsed ? ' collapsed' : ''}`}
        style={consoleCollapsed ? undefined : { height: consoleHeight }}
      >
        <div className="console-section-header" onClick={() => setConsoleCollapsed(!consoleCollapsed)}>
          <span className={`console-section-chevron${consoleCollapsed ? '' : ' expanded'}`}>&#9654;</span>
          <span className="console-section-title">Console</span>
          {consoleEntries.allEntries.length > 0 && (
            <span className="console-section-badge">{consoleEntries.allEntries.length}</span>
          )}
        </div>
        {!consoleCollapsed && (
          <ConsolePanel
            entries={consoleEntries.entries}
            filter={consoleEntries.filter}
            onFilterChange={consoleEntries.setFilter}
            onClear={consoleEntries.clear}
          />
        )}
      </div>

      {selectedEvent && (
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}
