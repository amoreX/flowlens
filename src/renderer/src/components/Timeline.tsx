import { useEffect, useRef } from 'react'
import type { TraceData, CapturedEvent } from '../types/events'
import { TraceGroup } from './TraceGroup'

interface TimelineProps {
  traces: TraceData[]
  selectedEventId: string | null
  focusedEventId: string | null
  onSelectEvent: (event: CapturedEvent) => void
  onFocusTrace: (traceId: string) => void
  onOpenTraceDetails: (traceId: string) => void
  onClear: () => void
}

export function Timeline({ traces, selectedEventId, focusedEventId, onSelectEvent, onFocusTrace, onOpenTraceDetails, onClear }: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)

  // Keep focused event visible when navigating through a trace.
  useEffect(() => {
    if (!focusedEventId) return

    let raf = 0
    const scrollFocusedEventIntoView = (): void => {
      const root = timelineRef.current
      if (!root) return
      const focusedEvent = root.querySelector<HTMLElement>('.timeline-event.focused')
      if (!focusedEvent) return
      focusedEvent.scrollIntoView({ block: 'nearest' })
    }

    raf = window.requestAnimationFrame(scrollFocusedEventIntoView)
    return () => window.cancelAnimationFrame(raf)
  }, [focusedEventId])

  return (
    <div className="timeline" ref={timelineRef}>
      <div className="timeline-header">
        <h2 className="timeline-title">Traces</h2>
        {traces.length > 0 && (
          <button className="timeline-clear-btn no-drag" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      {traces.length === 0 ? (
        <div className="timeline-empty">
          <div className="timeline-empty-icon">~</div>
          <p className="timeline-empty-text">
            Interact with the target site to see events appear here in real-time.
          </p>
        </div>
      ) : (
        traces.map((trace) => (
          <TraceGroup
            key={trace.id}
            trace={trace}
            selectedEventId={selectedEventId}
            focusedEventId={focusedEventId}
            onSelectEvent={onSelectEvent}
            onFocusTrace={onFocusTrace}
            onOpenTraceDetails={onOpenTraceDetails}
          />
        ))
      )}
    </div>
  )
}
