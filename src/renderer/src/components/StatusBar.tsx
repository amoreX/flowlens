interface StatusBarProps {
  url: string
  eventCount: number
  onStop: () => void
}

export function StatusBar({ url, eventCount, onStop }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-dot" />
      <span className="status-url" title={url}>{url}</span>
      <span className="status-event-count">{eventCount} events</span>
      <button className="status-stop-btn no-drag" onClick={onStop}>
        Stop
      </button>
    </div>
  )
}
