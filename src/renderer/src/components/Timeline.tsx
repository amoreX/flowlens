import type { TraceData, CapturedEvent } from '../types/events'
import { TraceGroup } from './TraceGroup'

interface TimelineProps {
  traces: TraceData[]
  selectedEventId: string | null
  focusedEventId: string | null
  onSelectEvent: (event: CapturedEvent) => void
  onClear: () => void
}

export function Timeline({ traces, selectedEventId, focusedEventId, onSelectEvent, onClear }: TimelineProps) {
  return (
    <div className="timeline">
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
          />
        ))
      )}
    </div>
  )
}
