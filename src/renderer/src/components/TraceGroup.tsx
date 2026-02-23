import { useState } from 'react'
import type { TraceData, CapturedEvent, DomEventData } from '../types/events'
import { TimelineEvent } from './TimelineEvent'
import { EventBadge } from './EventBadge'

interface TraceGroupProps {
  trace: TraceData
  selectedEventId: string | null
  focusedEventId: string | null
  onSelectEvent: (event: CapturedEvent) => void
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
  return `${root.type}`
}

export function TraceGroup({ trace, selectedEventId, focusedEventId, onSelectEvent }: TraceGroupProps) {
  // Auto-expand if this trace contains the focused event
  const containsFocused = focusedEventId ? trace.events.some((e) => e.id === focusedEventId) : false
  const [expanded, setExpanded] = useState(true)
  // Force expand when focused event enters this trace
  if (containsFocused && !expanded) {
    setExpanded(true)
  }
  const duration = trace.endTime - trace.startTime

  return (
    <div className="trace-group">
      <div className="trace-group-header" onClick={() => setExpanded(!expanded)}>
        <span className={`trace-group-chevron${expanded ? ' expanded' : ''}`}>&#9654;</span>
        <span className="trace-group-label">{getTraceLabel(trace)}</span>
        <div className="trace-group-meta">
          <EventBadge count={trace.events.length} />
          {duration > 0 && <span className="trace-group-duration">{duration}ms</span>}
          <span className="trace-group-time">{formatTime(trace.startTime)}</span>
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
