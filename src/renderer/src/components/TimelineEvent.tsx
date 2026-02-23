import type {
  CapturedEvent,
  DomEventData,
  NetworkRequestData,
  NetworkResponseData,
  NetworkErrorData,
  ConsoleEventData,
  ErrorEventData,
  NavigationEventData,
  BackendSpanData,
  StateChangeData
} from '../types/events'

interface TimelineEventProps {
  event: CapturedEvent
  traceStartTime: number
  selected: boolean
  focused: boolean
  onClick: () => void
}

function formatOffset(ms: number): string {
  if (ms < 1000) return `+${ms}ms`
  return `+${(ms / 1000).toFixed(1)}s`
}

function badgeLabel(event: CapturedEvent): string {
  switch (event.type) {
    case 'dom': return 'UI'
    case 'network-request': return 'REQ'
    case 'network-response': return 'RES'
    case 'network-error': return 'ERR'
    case 'console': return 'LOG'
    case 'error': return 'ERR'
    case 'navigation': return 'NAV'
    case 'backend-span': {
      const d = event.data as BackendSpanData
      if (d.phase === 'request') return 'REQ'
      if (d.phase === 'handler') return 'APP'
      if (d.phase === 'response') return 'RES'
      return 'SVC'
    }
    case 'state-change': return 'SET'
    default: return 'EVT'
  }
}

function getSummary(event: CapturedEvent): string {
  const data = event.data
  switch (event.type) {
    case 'dom': {
      const d = data as DomEventData
      return `${d.eventType} on ${d.target}`
    }
    case 'network-request': {
      const d = data as NetworkRequestData
      return `${d.method} ${d.url}`
    }
    case 'network-response': {
      const d = data as NetworkResponseData
      return `${d.status} ${d.method} ${d.url} (${d.duration}ms)`
    }
    case 'network-error': {
      const d = data as NetworkErrorData
      return `${d.method} ${d.url} — ${d.error}`
    }
    case 'console': {
      const d = data as ConsoleEventData
      return `${d.level}: ${d.args.join(' ')}`
    }
    case 'error': {
      const d = data as ErrorEventData
      return d.message
    }
    case 'navigation': {
      const d = data as NavigationEventData
      return d.url
    }
    case 'backend-span': {
      const d = data as BackendSpanData
      if (d.phase === 'request') {
        return `[${d.serviceName}] REQ ${d.method} ${d.route}`
      }
      if (d.phase === 'handler') {
        return `[${d.serviceName}] APP ${d.method} ${d.route}${d.step ? ` (${d.step})` : ''}`
      }
      return `[${d.serviceName}] RES ${d.statusCode} ${d.method} ${d.route} (${d.duration}ms)`
    }
    case 'state-change': {
      const d = data as StateChangeData
      return `${d.component} — ${d.prevValue} → ${d.value}`
    }
    default:
      return JSON.stringify(data)
  }
}

export function TimelineEvent({ event, traceStartTime, selected, focused, onClick }: TimelineEventProps) {
  const offset = event.timestamp - traceStartTime
  const cls = `timeline-event${selected ? ' selected' : ''}${focused ? ' focused' : ''}`

  return (
    <div className={cls} onClick={onClick}>
      <span className="event-offset">{formatOffset(offset)}</span>
      <span className={`event-type-badge ${event.type}`}>{badgeLabel(event)}</span>
      <span className="event-summary" title={getSummary(event)}>
        {getSummary(event)}
      </span>
    </div>
  )
}
