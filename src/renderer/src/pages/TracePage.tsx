import { useState, useRef, useCallback } from 'react'
import { useTraceEvents } from '../hooks/useTraceEvents'
import { useConsoleEntries } from '../hooks/useConsoleEntries'
import { useSourceHitMap } from '../hooks/useSourceHitMap'
import { StatusBar } from '../components/StatusBar'
import { TabBar, type TabId } from '../components/TabBar'
import { Timeline } from '../components/Timeline'
import { ConsolePanel } from '../components/ConsolePanel'
import { SourceCodePanel } from '../components/SourceCodePanel'
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
  const [activeTab, setActiveTab] = useState<TabId>('traces')

  // Console entries + unread badge
  const consoleEntries = useConsoleEntries()
  const unreadRef = useRef(0)
  const [consoleBadge, setConsoleBadge] = useState(0)
  const lastCountRef = useRef(0)

  // Track unread console entries when not on console tab
  const totalConsole = consoleEntries.allEntries.length
  if (totalConsole > lastCountRef.current) {
    const newCount = totalConsole - lastCountRef.current
    lastCountRef.current = totalConsole
    if (activeTab !== 'console') {
      unreadRef.current += newCount
      if (unreadRef.current !== consoleBadge) {
        // Will be picked up on next render
        queueMicrotask(() => setConsoleBadge(unreadRef.current))
      }
    }
  }

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab)
    if (tab === 'console') {
      unreadRef.current = 0
      setConsoleBadge(0)
    }
  }, [])

  // Source hit map
  const sourceHitMap = useSourceHitMap()

  return (
    <div className="trace-page">
      <StatusBar url={targetUrl} eventCount={eventCount} onStop={onStop} />
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} consoleBadge={consoleBadge} />

      <div className="tab-content">
        {activeTab === 'traces' && (
          <Timeline
            traces={traces}
            selectedEventId={selectedEvent?.id ?? null}
            onSelectEvent={setSelectedEvent}
            onClear={clearTraces}
          />
        )}
        {activeTab === 'source' && (
          <SourceCodePanel hitMap={sourceHitMap} />
        )}
        {activeTab === 'console' && (
          <ConsolePanel
            entries={consoleEntries.entries}
            filter={consoleEntries.filter}
            onFilterChange={consoleEntries.setFilter}
            onClear={consoleEntries.clear}
          />
        )}
      </div>

      {selectedEvent && (
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}
