import { useState, useEffect, useRef, useCallback } from 'react'
import type { StateChangeEntry, ResponseEntry } from '../hooks/useInspectorEntries'
import '../assets/inspector-panel.css'

type InspectorTab = 'state' | 'responses'

interface InspectorPanelProps {
  stateChanges: StateChangeEntry[]
  responses: ResponseEntry[]
  onClear: () => void
  focusedEventId?: string | null
  focusedTraceId?: string | null
  onNavigate?: (eventId: string, traceId: string) => void
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

function statusClass(status: number): string {
  if (status >= 500) return 'status-error'
  if (status >= 400) return 'status-warn'
  if (status >= 200 && status < 300) return 'status-ok'
  return 'status-info'
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s
}

function formatJsonPreview(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function ValueDisplay({ label, value }: { label: string; value: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = value.length > 60
  const display = expanded ? formatJsonPreview(value) : truncate(value, 60)

  return (
    <span className="inspector-value-wrap">
      <span className="inspector-value-label">{label}</span>
      <code className={`inspector-value${expanded ? ' expanded' : ''}`}>{display}</code>
      {isLong && (
        <button className="inspector-expand-btn" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}>
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </span>
  )
}

function StateChangeRow({ entry, focused, inTrace, onNavigate }: { entry: StateChangeEntry; focused: boolean; inTrace: boolean; onNavigate?: (eventId: string, traceId: string) => void }) {
  const cls = focused ? ' focused' : inTrace ? ' in-trace' : ''
  return (
    <div
      className={`inspector-row clickable${cls}`}
      data-entry-id={entry.id}
      onClick={() => onNavigate?.(entry.id, entry.traceId)}
    >
      <span className="inspector-time">{formatTime(entry.timestamp)}</span>
      <span className="inspector-component-badge">{entry.component}</span>
      <span className="inspector-state-flow">
        <ValueDisplay label="" value={entry.prevValue} />
        <span className="inspector-arrow">{'\u2192'}</span>
        <ValueDisplay label="" value={entry.value} />
      </span>
    </div>
  )
}

function ResponseRow({ entry, focused, inTrace, onNavigate }: { entry: ResponseEntry; focused: boolean; inTrace: boolean; onNavigate?: (eventId: string, traceId: string) => void }) {
  const [bodyOpen, setBodyOpen] = useState(false)
  const cls = focused ? ' focused' : inTrace ? ' in-trace' : ''

  return (
    <div
      className={`inspector-row inspector-response-row clickable${cls}`}
      data-entry-id={entry.id}
      onClick={() => onNavigate?.(entry.id, entry.traceId)}
    >
      <div className="inspector-response-header">
        <span className="inspector-time">{formatTime(entry.timestamp)}</span>
        <span className={`inspector-status-badge ${statusClass(entry.status)}`}>
          {entry.status}
        </span>
        <span className="inspector-method">{entry.method}</span>
        <span className="inspector-url" title={entry.url}>{truncate(entry.url, 60)}</span>
        <span className="inspector-duration">{entry.duration}ms</span>
        {entry.bodyPreview && (
          <button
            className="inspector-body-toggle"
            onClick={(e) => { e.stopPropagation(); setBodyOpen((v) => !v) }}
          >
            {bodyOpen ? 'hide body' : 'show body'}
          </button>
        )}
      </div>
      {bodyOpen && entry.bodyPreview && (
        <pre className="inspector-body-preview">{formatJsonPreview(entry.bodyPreview)}</pre>
      )}
    </div>
  )
}

export function InspectorPanel({ stateChanges, responses, onClear, focusedEventId, focusedTraceId, onNavigate }: InspectorPanelProps) {
  const [tab, setTab] = useState<InspectorTab>('state')
  const listRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showFab, setShowFab] = useState(false)
  const lastFocusedRef = useRef<string | null>(null)

  const items = tab === 'state' ? stateChanges : responses

  // Auto-switch tab and scroll to the focused entry when trace navigation happens
  useEffect(() => {
    if (!focusedEventId || focusedEventId === lastFocusedRef.current) return
    lastFocusedRef.current = focusedEventId

    const isState = stateChanges.some((e) => e.id === focusedEventId)
    const isResponse = responses.some((e) => e.id === focusedEventId)

    if (isState && tab !== 'state') {
      setTab('state')
    } else if (isResponse && tab !== 'responses') {
      setTab('responses')
    }

    if (isState || isResponse) {
      setAutoScroll(false)
      requestAnimationFrame(() => {
        if (!listRef.current) return
        const el = listRef.current.querySelector(`[data-entry-id="${focusedEventId}"]`)
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
  }, [focusedEventId, stateChanges, responses, tab])

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [items.length, autoScroll])

  const handleScroll = useCallback(() => {
    if (!listRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setAutoScroll(atBottom)
    setShowFab(!atBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
      setAutoScroll(true)
      setShowFab(false)
    }
  }, [])

  return (
    <div className="inspector-panel">
      <div className="inspector-toolbar">
        <button
          className={`inspector-tab-btn${tab === 'state' ? ' active' : ''}`}
          onClick={() => setTab('state')}
        >
          State
          {stateChanges.length > 0 && (
            <span className="inspector-tab-count">{stateChanges.length}</span>
          )}
        </button>
        <button
          className={`inspector-tab-btn${tab === 'responses' ? ' active' : ''}`}
          onClick={() => setTab('responses')}
        >
          Responses
          {responses.length > 0 && (
            <span className="inspector-tab-count">{responses.length}</span>
          )}
        </button>
        <div className="inspector-toolbar-spacer" />
        <button className="inspector-clear-btn" onClick={onClear}>Clear</button>
      </div>

      {items.length === 0 ? (
        <div className="inspector-empty">
          {tab === 'state'
            ? 'No state changes captured yet'
            : 'No response data captured yet'}
        </div>
      ) : (
        <div className="inspector-list" ref={listRef} onScroll={handleScroll}>
          {tab === 'state'
            ? stateChanges.map((e) => (
                <StateChangeRow
                  key={e.id}
                  entry={e}
                  focused={e.id === focusedEventId}
                  inTrace={!!focusedTraceId && e.traceId === focusedTraceId}
                  onNavigate={onNavigate}
                />
              ))
            : responses.map((e) => (
                <ResponseRow
                  key={e.id}
                  entry={e}
                  focused={e.id === focusedEventId}
                  inTrace={!!focusedTraceId && e.traceId === focusedTraceId}
                  onNavigate={onNavigate}
                />
              ))}
        </div>
      )}

      {showFab && (
        <button className="inspector-scroll-fab" onClick={scrollToBottom} title="Scroll to bottom">
          &#8595;
        </button>
      )}
    </div>
  )
}
