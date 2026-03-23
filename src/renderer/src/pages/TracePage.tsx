import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTraceEvents } from '../hooks/useTraceEvents'
import { useConsoleEntries, type ConsoleLevel } from '../hooks/useConsoleEntries'
import { useInspectorEntries } from '../hooks/useInspectorEntries'
import { useSourceHitMap, type SourceHitMap } from '../hooks/useSourceHitMap'
import { Timeline } from '../components/Timeline'
import { SourceCodePanel } from '../components/SourceCodePanel'
import { ConsolePanel } from '../components/ConsolePanel'
import { InspectorPanel } from '../components/InspectorPanel'
import { FlowNavigator } from '../components/FlowNavigator'
import { EventDetailPanel } from '../components/EventDetailPanel'
import { TourOverlay } from '../components/TourOverlay'
import { parseAllUserFrames, extractDisplayPath } from '../utils/stack-parser'
import {
  TOUR_MOCK_TRACES,
  TOUR_SOURCE_FILES,
  TOUR_CONSOLE_ENTRIES,
  TOUR_STATE_CHANGES,
  TOUR_RESPONSES
} from '../data/tour-mock-data'
import type { CapturedEvent, DomEventData } from '../types/events'
import '../assets/timeline.css'

interface TracePageProps {
  onStop: () => void
  inspectedSource?: { file: string; line: number } | null
  onClearInspectedSource?: () => void
  demoMode?: boolean
  onTourComplete?: () => void
}

export function TracePage({ onStop: _onStop, inspectedSource, onClearInspectedSource, demoMode, onTourComplete }: TracePageProps) {
  const { traces: liveTraces, clearTraces: liveClearTraces } = useTraceEvents()
  const traces = demoMode ? TOUR_MOCK_TRACES : liveTraces
  const clearTraces = demoMode ? (() => {}) : liveClearTraces
  const [selectedEvent, setSelectedEvent] = useState<CapturedEvent | null>(null)
  const [targetHighlightStatus, setTargetHighlightStatus] = useState<string | null>(null)
  const lastHighlightedEventIdRef = useRef<string | null>(null)

  // Flow navigation state
  const [focusedTraceId, setFocusedTraceId] = useState<string | null>(null)
  const [focusedEventIndex, setFocusedEventIndex] = useState(0)

  // Console & Inspector
  const liveConsoleEntries = useConsoleEntries()
  const liveInspectorEntries = useInspectorEntries()
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [bottomTab, setBottomTab] = useState<'console' | 'inspector'>('console')

  // Source hit map (live mode)
  const liveSourceHitMap = useSourceHitMap()

  // Demo mode overrides — provide mock data so all panels populate
  const [demoActiveFile, setDemoActiveFile] = useState<string | null>(null)
  const [demoConsoleFilter, setDemoConsoleFilter] = useState<ConsoleLevel>('all')

  const demoSourceHitMap = useMemo<SourceHitMap | null>(() => {
    if (!demoMode) return null

    const allTraceHits = new Map<string, import('../hooks/useSourceHitMap').TraceHitData>()
    let firstFileOrder: string[] = []

    for (const trace of TOUR_MOCK_TRACES) {
      const files = new Map<string, import('../hooks/useSourceHitMap').FileHitData>()
      let latestFile: string | null = null
      let latestLine: number | null = null
      let latestTs = 0

      for (const ev of trace.events) {
        const frames = parseAllUserFrames(ev.sourceStack)
        for (let fi = 0; fi < frames.length; fi++) {
          const f = frames[fi]
          let fd = files.get(f.filePath)
          if (!fd) {
            fd = { filePath: f.filePath, displayPath: extractDisplayPath(f.filePath), lines: new Map() }
            files.set(f.filePath, fd)
          }
          const existing = fd.lines.get(f.line)
          if (existing) {
            existing.count++
            existing.lastTimestamp = Math.max(existing.lastTimestamp, ev.timestamp)
            existing.isLatest = false
          } else {
            fd.lines.set(f.line, { count: 1, lastTimestamp: ev.timestamp, isLatest: false })
          }
          if (fi === 0 && ev.timestamp >= latestTs) {
            latestTs = ev.timestamp
            latestFile = f.filePath
            latestLine = f.line
          }
        }
      }
      if (latestFile && latestLine !== null) {
        files.get(latestFile)?.lines.get(latestLine)
          && (files.get(latestFile)!.lines.get(latestLine)!.isLatest = true)
      }
      const hits = { traceId: trace.id, files, latestFile, latestLine, seq: 1 }
      allTraceHits.set(trace.id, hits)
      if (firstFileOrder.length === 0) firstFileOrder = Array.from(files.keys())
    }

    const first = allTraceHits.values().next().value ?? null
    return {
      currentTraceHits: first,
      allTraceHits,
      sourceCache: TOUR_SOURCE_FILES,
      currentFileOrder: firstFileOrder,
      activeFile: demoActiveFile ?? firstFileOrder[0] ?? null,
      setActiveFile: setDemoActiveFile,
      fetchSourceIfNeeded: () => {}
    }
  }, [demoMode, demoActiveFile])

  const demoConsoleEntries = useMemo(() => {
    if (!demoMode) return null
    const filtered = demoConsoleFilter === 'all'
      ? TOUR_CONSOLE_ENTRIES
      : TOUR_CONSOLE_ENTRIES.filter((e) => e.level === demoConsoleFilter)
    return {
      entries: filtered,
      allEntries: TOUR_CONSOLE_ENTRIES,
      filter: demoConsoleFilter,
      setFilter: setDemoConsoleFilter,
      clear: () => {}
    }
  }, [demoMode, demoConsoleFilter])

  const demoInspectorEntries = useMemo(() => {
    if (!demoMode) return null
    return {
      stateChanges: TOUR_STATE_CHANGES,
      responses: TOUR_RESPONSES,
      totalCount: TOUR_STATE_CHANGES.length + TOUR_RESPONSES.length,
      clear: () => {}
    }
  }, [demoMode])

  const sourceHitMap = demoSourceHitMap ?? liveSourceHitMap
  const consoleEntries = demoConsoleEntries ?? liveConsoleEntries
  const inspectorEntries = demoInspectorEntries ?? liveInspectorEntries

  useEffect(() => {
    if (inspectedSource) {
      setFocusedTraceId(null)
      setFocusedEventIndex(0)
      setSelectedEvent(null)
      setTargetHighlightStatus(null)
    }
  }, [inspectedSource])

  const handleTourStepChange = useCallback((stepIndex: number) => {
    if (stepIndex === 5) {
      setBottomTab('inspector')
      setBottomCollapsed(false)
    } else if (stepIndex === 4) {
      setBottomTab('console')
      setBottomCollapsed(false)
    }
  }, [])

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

  const handleInspectorNavigate = useCallback((eventId: string, traceId: string) => {
    const trace = traces.find((t) => t.id === traceId)
    if (!trace) return
    const idx = trace.events.findIndex((e) => e.id === eventId)
    if (idx < 0) return
    setFocusedTraceId(traceId)
    setFocusedEventIndex(idx)
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
    setTargetHighlightStatus(null)
  }, [])

  const handleSourceNavigateToEvent = useCallback((eventId: string) => {
    if (!focusedTrace) return
    const idx = focusedTrace.events.findIndex((ev) => ev.id === eventId)
    if (idx < 0) return
    setFocusedEventIndex(idx)
    if (selectedEvent) setSelectedEvent(focusedTrace.events[idx])
  }, [focusedTrace, selectedEvent])

  // Keyboard arrow navigation when a trace is focused (disabled during tour)
  useEffect(() => {
    if (!focusedTrace || demoMode) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (focusedEventIndex > 0) {
          const newIdx = focusedEventIndex - 1
          setFocusedEventIndex(newIdx)
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
  }, [focusedTrace, focusedEventIndex, selectedEvent, demoMode])

  // Highlight DOM event targets in the embedded page while navigating (skip in demo)
  useEffect(() => {
    if (demoMode) return
    if (!focusedEvent) {
      setTargetHighlightStatus(null)
      return
    }
    if (focusedEvent.id === lastHighlightedEventIdRef.current) return
    lastHighlightedEventIdRef.current = focusedEvent.id

    if (focusedEvent.type !== 'dom') {
      setTargetHighlightStatus(null)
      return
    }

    const domData = focusedEvent.data as DomEventData
    window.flowlens
      .highlightDomTarget(domData)
      .then((result) => {
        if (result.success) {
          setTargetHighlightStatus(null)
        } else {
          setTargetHighlightStatus(result.reason || 'Could not highlight element in target view')
        }
      })
      .catch(() => {
        setTargetHighlightStatus('Could not highlight element in target view')
      })
  }, [focusedEvent, demoMode])

  return (
    <div className="trace-page" ref={tracePageRef}>
      <div className="main-content">
        <div className="traces-column" data-tour="timeline" style={{ width: tracesWidth }}>
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
          role="separator"
          aria-label="Resize traces and source panels"
        />

        <div className="source-column" data-tour="source-panel">
          <SourceCodePanel
            hitMap={sourceHitMap}
            focusedEvent={focusedEvent}
            focusedTraceEvents={focusedTrace?.events}
            onNavigateToTraceEvent={handleSourceNavigateToEvent}
            inspectedSource={inspectedSource}
            onClearInspectedSource={onClearInspectedSource}
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
        onMouseDown={bottomCollapsed ? undefined : onHDragStart}
        role="separator"
        aria-label="Resize main and bottom panels"
      />

      <div
        className={`bottom-section${bottomCollapsed ? ' collapsed' : ''}`}
        data-tour="bottom-panel"
        style={bottomCollapsed ? undefined : { height: consoleHeight }}
      >
        <div className="bottom-section-header">
          <button
            className="bottom-section-collapse"
            onClick={() => setBottomCollapsed(!bottomCollapsed)}
            title={bottomCollapsed ? 'Expand panel' : 'Collapse panel'}
            aria-label={bottomCollapsed ? 'Expand panel' : 'Collapse panel'}
            aria-expanded={!bottomCollapsed}
          >
            <span className={`bottom-section-chevron${bottomCollapsed ? '' : ' expanded'}`} aria-hidden="true">&#9654;</span>
          </button>
          <button
            className={`bottom-tab${bottomTab === 'console' ? ' active' : ''}`}
            onClick={() => { setBottomTab('console'); setBottomCollapsed(false) }}
            role="tab"
            aria-selected={bottomTab === 'console'}
          >
            Console
            {consoleEntries.allEntries.length > 0 && (
              <span className="bottom-tab-badge">{consoleEntries.allEntries.length}</span>
            )}
          </button>
          <button
            className={`bottom-tab${bottomTab === 'inspector' ? ' active' : ''}`}
            onClick={() => { setBottomTab('inspector'); setBottomCollapsed(false) }}
            role="tab"
            aria-selected={bottomTab === 'inspector'}
          >
            Inspector
            {inspectorEntries.totalCount > 0 && (
              <span className="bottom-tab-badge">{inspectorEntries.totalCount}</span>
            )}
          </button>
          {targetHighlightStatus && (
            <>
              <div className="bottom-header-spacer" />
              <span className="bottom-header-note" title={targetHighlightStatus}>
                {targetHighlightStatus}
              </span>
            </>
          )}
        </div>
        {!bottomCollapsed && bottomTab === 'console' && (
          <ConsolePanel
            entries={consoleEntries.entries}
            filter={consoleEntries.filter}
            onFilterChange={consoleEntries.setFilter}
            onClear={consoleEntries.clear}
          />
        )}
        {!bottomCollapsed && bottomTab === 'inspector' && (
          <InspectorPanel
            stateChanges={inspectorEntries.stateChanges}
            responses={inspectorEntries.responses}
            onClear={inspectorEntries.clear}
            focusedEventId={focusedEvent?.id}
            focusedTraceId={focusedTraceId}
            onNavigate={handleInspectorNavigate}
          />
        )}
      </div>

      {selectedEvent && !demoMode && (
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      {demoMode && onTourComplete && (
        <TourOverlay onComplete={onTourComplete} onStepChange={handleTourStepChange} />
      )}
    </div>
  )
}
