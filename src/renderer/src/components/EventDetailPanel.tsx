import type { CapturedEvent, BackendSpanData, StateChangeData } from '../types/events'
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

function StateChangeDetail({ data }: { data: StateChangeData }) {
  return (
    <div className="detail-state-change">
      <div className="detail-row">
        <span className="detail-key">Component</span>
        <span className="detail-value">{data.component}</span>
      </div>
      <div className="detail-row">
        <span className="detail-key">Hook</span>
        <span className="detail-value">useState #{data.hookIndex}</span>
      </div>
      <div className="detail-row">
        <span className="detail-key">Previous</span>
        <span className="detail-value">{data.prevValue}</span>
      </div>
      <div className="detail-row">
        <span className="detail-key">Current</span>
        <span className="detail-value">{data.value}</span>
      </div>
    </div>
  )
}

function BackendSpanDetail({ data }: { data: BackendSpanData }) {
  return (
    <div className="detail-backend-span">
      {data.phase && (
        <div className="detail-row">
          <span className="detail-key">Phase</span>
          <span className="detail-value">{data.phase}</span>
        </div>
      )}
      {data.step && (
        <div className="detail-row">
          <span className="detail-key">Step</span>
          <span className="detail-value">{data.step}</span>
        </div>
      )}
      <div className="detail-row">
        <span className="detail-key">Service</span>
        <span className="detail-value">{data.serviceName}</span>
      </div>
      <div className="detail-row">
        <span className="detail-key">Route</span>
        <span className="detail-value">{data.method} {data.route}</span>
      </div>
      <div className="detail-row">
        <span className="detail-key">Status</span>
        <span className="detail-value">{data.statusCode}</span>
      </div>
      <div className="detail-row">
        <span className="detail-key">Duration</span>
        <span className="detail-value">{data.duration}ms</span>
      </div>
    </div>
  )
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
            {event.type === 'backend-span' ? (
              <BackendSpanDetail data={event.data as BackendSpanData} />
            ) : event.type === 'state-change' ? (
              <StateChangeDetail data={event.data as StateChangeData} />
            ) : (
              <pre className="detail-json">{JSON.stringify(event.data, null, 2)}</pre>
            )}
          </div>

          <SourceCodeViewer event={event} />
        </div>
      </div>
    </div>
  )
}
