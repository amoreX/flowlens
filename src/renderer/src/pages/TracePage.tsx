import { useState } from 'react'
import { useTraceEvents } from '../hooks/useTraceEvents'
import { StatusBar } from '../components/StatusBar'
import { Timeline } from '../components/Timeline'
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

  return (
    <div className="trace-page">
      <StatusBar url={targetUrl} eventCount={eventCount} onStop={onStop} />
      <Timeline
        traces={traces}
        selectedEventId={selectedEvent?.id ?? null}
        onSelectEvent={setSelectedEvent}
        onClear={clearTraces}
      />
      {selectedEvent && (
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}
