import type { CapturedEvent } from '../types/events'
import { SourceCodeViewer } from './SourceCodeViewer'
import '../assets/detail-panel.css'

interface EventDetailPanelProps {
  event: CapturedEvent
  onClose: () => void
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

export function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
  return (
    <div className="detail-panel-overlay">
      <div className="detail-panel">
        <div className="detail-panel-header">
          <h3 className="detail-panel-title">Event Details</h3>
          <button className="detail-panel-close no-drag" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="detail-panel-body">
          <div className="detail-section">
            <div className="detail-section-title">Metadata</div>
            <div className="detail-row">
              <span className="detail-key">Type</span>
              <span className="detail-value">{event.type}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Trace ID</span>
              <span className="detail-value">{event.traceId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Event ID</span>
              <span className="detail-value">{event.id}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Time</span>
              <span className="detail-value">{formatTimestamp(event.timestamp)}</span>
            </div>
            {event.url && (
              <div className="detail-row">
                <span className="detail-key">URL</span>
                <span className="detail-value">{event.url}</span>
              </div>
            )}
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Data</div>
            <pre className="detail-json">{JSON.stringify(event.data, null, 2)}</pre>
          </div>

          <SourceCodeViewer event={event} />
        </div>
      </div>
    </div>
  )
}
