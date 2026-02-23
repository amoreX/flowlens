import { useState } from 'react'
import type { TraceData, CapturedEvent, DomEventData } from '../types/events'
import { TimelineEvent } from './TimelineEvent'
import { EventBadge } from './EventBadge'

interface TraceGroupProps {
  trace: TraceData
  selectedEventId: string | null
  focusedEventId: string | null
  onSelectEvent: (event: CapturedEvent) => void
  onFocusTrace: (traceId: string) => void
  onOpenTraceDetails: (traceId: string) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getTraceLabel(trace: TraceData): string {
  const root = trace.rootEvent
  if (root.type === 'dom') {
    const data = root.data as DomEventData
    return `${data.eventType} → ${data.target}`
  }
  if (root.type === 'navigation') {
    return `Navigation`
  }
  if (root.type === 'backend-span') {
    return `Backend Span`
  }
  if (root.type === 'state-change') {
    return `State Update`
  }
  return `${root.type}`
}

export function TraceGroup({ trace, selectedEventId, focusedEventId, onSelectEvent, onFocusTrace, onOpenTraceDetails }: TraceGroupProps) {
  // Auto-expand if this trace contains the focused event
  const containsFocused = focusedEventId ? trace.events.some((e) => e.id === focusedEventId) : false
  const [expanded, setExpanded] = useState(true)
  // Force expand when focused event enters this trace
  if (containsFocused && !expanded) {
    setExpanded(true)
  }
  const isFocusedTrace = containsFocused

  return (
    <div className={`trace-group${isFocusedTrace ? ' focused' : ''}`}>
      <div className="trace-group-header" onClick={() => setExpanded(!expanded)}>
        <span className={`trace-group-chevron${expanded ? ' expanded' : ''}`}>&#9654;</span>
        <span className="trace-group-label">{getTraceLabel(trace)}</span>
        <div className="trace-group-meta">
          <EventBadge count={trace.events.length} />
          <span className="trace-group-time">{formatTime(trace.startTime)}</span>
          <button
            className="trace-focus-btn"
            title="Focus source on this trace"
            onClick={(e) => {
              e.stopPropagation()
              onFocusTrace(trace.id)
            }}
          >
            {'</>'}
          </button>
          <button
            className="trace-details-btn"
            title="Open event details"
            onClick={(e) => {
              e.stopPropagation()
              onOpenTraceDetails(trace.id)
            }}
          >
            {'{ }'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="trace-group-events">
          {trace.events.map((event) => (
            <TimelineEvent
              key={event.id}
              event={event}
              traceStartTime={trace.startTime}
              selected={event.id === selectedEventId}
              focused={event.id === focusedEventId}
              onClick={() => onSelectEvent(event)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
