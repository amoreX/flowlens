import { useEffect, useRef, useState, useCallback } from 'react'
import type { ConsoleEntry, ConsoleLevel } from '../hooks/useConsoleEntries'
import '../assets/console-panel.css'

interface ConsolePanelProps {
  entries: ConsoleEntry[]
  filter: ConsoleLevel
  onFilterChange: (level: ConsoleLevel) => void
  onClear: () => void
}

const LEVELS: ConsoleLevel[] = ['all', 'error', 'warn', 'info', 'log', 'debug']

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

export function ConsolePanel({ entries, filter, onFilterChange, onClear }: ConsolePanelProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showFab, setShowFab] = useState(false)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries.length, autoScroll])

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
    <div className="console-panel">
      <div className="console-toolbar">
        {LEVELS.map((level) => (
          <button
            key={level}
            className={`console-filter-btn level-${level}${filter === level ? ' active' : ''}`}
            onClick={() => onFilterChange(level)}
          >
            {level}
          </button>
        ))}
        <div className="console-toolbar-spacer" />
        <button className="console-clear-btn" onClick={onClear}>Clear</button>
      </div>

      {entries.length === 0 ? (
        <div className="console-empty">
          <div className="console-empty-text">
            Console output will appear here as the target app runs
          </div>
        </div>
      ) : (
        <div className="console-log-list" ref={listRef} onScroll={handleScroll}>
          {entries.map((entry) => (
            <div key={entry.id} className={`console-entry level-${entry.level}`}>
              <span className="console-entry-time">{formatTime(entry.timestamp)}</span>
              <span className={`console-level-badge level-${entry.level}`}>{entry.level}</span>
              <span className="console-entry-message">{entry.message}</span>
            </div>
          ))}
        </div>
      )}

      {showFab && (
        <button className="console-scroll-fab" onClick={scrollToBottom} title="Scroll to bottom">
          &#8595;
        </button>
      )}
    </div>
  )
}
