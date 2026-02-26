import { FlowLensLogo } from './FlowLensLogo'

interface StatusBarProps {
  url: string
  eventCount: number
  onStop: () => void
  sdkMode?: boolean
  sdkConnections?: number
}

export function StatusBar({ url, eventCount, onStop, sdkMode, sdkConnections }: StatusBarProps) {
  return (
    <div className="status-bar">
      <FlowLensLogo />
      <div className="status-dot" />
      {sdkMode ? (
        <>
          <span className="status-sdk-badge">SDK Mode</span>
          <span className="status-sdk-connections">
            {sdkConnections || 0} {sdkConnections === 1 ? 'app' : 'apps'} connected
          </span>
        </>
      ) : (
        <span className="status-url" title={url}>{url}</span>
      )}
      <span className="status-event-count">{eventCount} events</span>
      <button className="status-stop-btn no-drag" onClick={onStop}>
        Stop
      </button>
    </div>
  )
}
