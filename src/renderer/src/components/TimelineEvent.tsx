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

function truncVal(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s
}

function getDetailRows(event: CapturedEvent): [string, string][] {
  const data = event.data
  switch (event.type) {
    case 'dom': {
      const d = data as DomEventData
      const rows: [string, string][] = [
        ['event', d.eventType],
        ['target', `${d.tagName}${d.id ? '#' + d.id : ''}${d.className ? '.' + d.className.split(' ')[0] : ''}`]
      ]
      if (d.textContent) rows.push(['text', truncVal(d.textContent, 80)])
      if (d.value !== undefined) rows.push(['value', truncVal(d.value, 80)])
      return rows
    }
    case 'network-request': {
      const d = data as NetworkRequestData
      const rows: [string, string][] = [
        ['method', d.method],
        ['url', d.url]
      ]
      if (d.body) rows.push(['body', truncVal(d.body, 120)])
      return rows
    }
    case 'network-response': {
      const d = data as NetworkResponseData
      const rows: [string, string][] = [
        ['status', `${d.status} ${d.statusText}`],
        ['url', `${d.method} ${d.url}`],
        ['duration', `${d.duration}ms`]
      ]
      if (d.bodyPreview) rows.push(['response', truncVal(d.bodyPreview, 120)])
      return rows
    }
    case 'network-error': {
      const d = data as NetworkErrorData
      return [
        ['url', `${d.method} ${d.url}`],
        ['error', d.error],
        ['duration', `${d.duration}ms`]
      ]
    }
    case 'console': {
      const d = data as ConsoleEventData
      return [
        ['level', d.level],
        ['message', truncVal(d.args.join(' '), 200)]
      ]
    }
    case 'error': {
      const d = data as ErrorEventData
      const rows: [string, string][] = [
        ['type', d.type],
        ['message', truncVal(d.message, 200)]
      ]
      if (d.filename) rows.push(['file', `${d.filename}${d.lineno ? ':' + d.lineno : ''}`])
      return rows
    }
    case 'navigation': {
      const d = data as NavigationEventData
      return [
        ['type', d.type],
        ['url', d.url]
      ]
    }
    case 'backend-span': {
      const d = data as BackendSpanData
      return [
        ['service', d.serviceName],
        ['route', `${d.method} ${d.route}`],
        ['status', String(d.statusCode)],
        ['duration', `${d.duration}ms`],
        ...(d.phase ? [['phase', `${d.phase}${d.step ? ' / ' + d.step : ''}`] as [string, string]] : [])
      ]
    }
    case 'state-change': {
      const d = data as StateChangeData
      return [
        ['component', d.component],
        ['prev', truncVal(d.prevValue, 120)],
        ['next', truncVal(d.value, 120)]
      ]
    }
    default:
      return []
  }
}

export function TimelineEvent({ event, traceStartTime, selected, focused, onClick }: TimelineEventProps) {
  const offset = event.timestamp - traceStartTime
  const cls = `timeline-event${selected ? ' selected' : ''}${focused ? ' focused' : ''}`

  return (
    <div className={cls} onClick={onClick}>
      <div className="event-header">
        <span className="event-offset">{formatOffset(offset)}</span>
        <span className={`event-type-badge ${event.type}`}>{badgeLabel(event)}</span>
        <span className="event-summary" title={getSummary(event)}>
          {getSummary(event)}
        </span>
      </div>
      {focused && (
        <div className="event-detail-dropdown">
          {getDetailRows(event).map(([label, value]) => (
            <div key={label} className="event-detail-row">
              <span className="event-detail-label">{label}</span>
              <span className="event-detail-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
