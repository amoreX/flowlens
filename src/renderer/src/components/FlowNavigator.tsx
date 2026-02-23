import type { CapturedEvent, DomEventData, ConsoleEventData, NetworkRequestData, ErrorEventData } from '../types/events'
import '../assets/flow-navigator.css'

interface FlowNavigatorProps {
  events: CapturedEvent[]
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

function getEventSummary(event: CapturedEvent): string {
  switch (event.type) {
    case 'dom': {
      const d = event.data as DomEventData
      return `${d.eventType} on ${d.target}`
    }
    case 'console': {
      const d = event.data as ConsoleEventData
      return `${d.level}: ${d.args.join(' ')}`
    }
    case 'network-request': {
      const d = event.data as NetworkRequestData
      return `${d.method} ${d.url}`
    }
    case 'error': {
      const d = event.data as ErrorEventData
      return d.message
    }
    default:
      return event.type
  }
}

function badgeLabel(type: string): string {
  switch (type) {
    case 'dom': return 'UI'
    case 'network-request': return 'REQ'
    case 'network-response': return 'RES'
    case 'network-error': return 'ERR'
    case 'console': return 'LOG'
    case 'error': return 'ERR'
    case 'navigation': return 'NAV'
    default: return type.toUpperCase()
  }
}

export function FlowNavigator({ events, currentIndex, onPrev, onNext, onClose }: FlowNavigatorProps) {
  const current = events[currentIndex]
  if (!current) return null

  return (
    <div className="flow-navigator">
      <button
        className="flow-nav-btn"
        onClick={onPrev}
        disabled={currentIndex === 0}
        title="Previous event"
      >
        &#8592;
      </button>

      <div className="flow-nav-info">
        <span className="flow-nav-counter">{currentIndex + 1}/{events.length}</span>
        <span className={`event-type-badge ${current.type}`}>{badgeLabel(current.type)}</span>
        <span className="flow-nav-summary" title={getEventSummary(current)}>
          {getEventSummary(current)}
        </span>
      </div>

      <button
        className="flow-nav-btn"
        onClick={onNext}
        disabled={currentIndex === events.length - 1}
        title="Next event"
      >
        &#8594;
      </button>

      <button className="flow-nav-close" onClick={onClose} title="Exit flow navigation">
        &times;
      </button>
    </div>
  )
}
