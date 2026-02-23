import { useState, useCallback, useMemo } from 'react'
import { useTraceEvents } from '../hooks/useTraceEvents'
import { useConsoleEntries } from '../hooks/useConsoleEntries'
import { useSourceHitMap } from '../hooks/useSourceHitMap'
import { StatusBar } from '../components/StatusBar'
import { Timeline } from '../components/Timeline'
import { SourceCodePanel } from '../components/SourceCodePanel'
import { ConsolePanel } from '../components/ConsolePanel'
import { FlowNavigator } from '../components/FlowNavigator'
import { EventDetailPanel } from '../components/EventDetailPanel'
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

  // Get the focused trace's events
  const focusedTrace = useMemo(() => {
    if (!focusedTraceId) return null
    return traces.find((t) => t.id === focusedTraceId) ?? null
  }, [focusedTraceId, traces])

  const focusedEvent = focusedTrace?.events[focusedEventIndex] ?? null

  // When user clicks an event in the timeline
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
      if (focusedTrace) {
        setSelectedEvent(focusedTrace.events[newIdx])
      }
    }
  }, [focusedEventIndex, focusedTrace])

  const handleNextEvent = useCallback(() => {
    if (focusedTrace && focusedEventIndex < focusedTrace.events.length - 1) {
      const newIdx = focusedEventIndex + 1
      setFocusedEventIndex(newIdx)
      setSelectedEvent(focusedTrace.events[newIdx])
    }
  }, [focusedEventIndex, focusedTrace])

  const handleCloseFlow = useCallback(() => {
    setFocusedTraceId(null)
    setFocusedEventIndex(0)
    setSelectedEvent(null)
  }, [])

  return (
    <div className="trace-page">
      <StatusBar url={targetUrl} eventCount={eventCount} onStop={onStop} />

      <div className="main-content">
        <div className="traces-column">
          <Timeline
            traces={traces}
            selectedEventId={selectedEvent?.id ?? null}
            focusedEventId={focusedEvent?.id ?? null}
            onSelectEvent={handleSelectEvent}
            onClear={clearTraces}
          />
        </div>

        <div className="source-column">
          <SourceCodePanel
            hitMap={sourceHitMap}
            focusedEvent={focusedEvent}
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

      <div className={`console-section${consoleCollapsed ? ' collapsed' : ''}`}>
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
