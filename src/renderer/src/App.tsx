import { useState, useCallback, useEffect } from 'react'
import { OnboardingPage } from './pages/OnboardingPage'
import { TracePage } from './pages/TracePage'

type AppMode = 'onboarding' | 'trace' | 'sdk-listening'

export default function App() {
  const [mode, setMode] = useState<AppMode>('onboarding')
  const [targetUrl, setTargetUrl] = useState('')
  const [splitRatio, setSplitRatio] = useState(0.55)
  const [draggingSplit, setDraggingSplit] = useState(false)
  const [sdkConnections, setSdkConnections] = useState(0)

  const handleLaunch = useCallback(async (url: string) => {
    await window.flowlens.loadTargetUrl(url)
    setTargetUrl(url)
    setMode('trace')
  }, [])

  const handleStop = useCallback(async () => {
    await window.flowlens.unloadTarget()
    setTargetUrl('')
    setMode('onboarding')
  }, [])

  const handleSdkMode = useCallback(async () => {
    const result = await window.flowlens.startSdkMode()
    setSdkConnections(result.connectedClients)
    setMode('sdk-listening')
  }, [])

  const handleSdkStop = useCallback(async () => {
    await window.flowlens.stopSdkMode()
    setSdkConnections(0)
    setMode('onboarding')
  }, [])

  // Listen for SDK connection count changes
  useEffect(() => {
    const unsub = window.flowlens.onSdkConnectionCount((count: number) => {
      setSdkConnections(count)
    })
    return unsub
  }, [])

  const onSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingSplit(true)
    const startX = e.clientX
    const startRatio = splitRatio

    const onMove = (me: MouseEvent): void => {
      const newRatio = startRatio + (me.clientX - startX) / window.innerWidth
      const clamped = Math.max(0.2, Math.min(0.8, newRatio))
      setSplitRatio(clamped)
      window.flowlens.setSplitRatio(clamped)
    }
    const onUp = (): void => {
      setDraggingSplit(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [splitRatio])

  useEffect(() => {
    if (draggingSplit) {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    } else {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [draggingSplit])

  // In embedded mode, offset for the target view; in SDK mode, full width
  const traceStyle = mode === 'trace'
    ? { width: `${(1 - splitRatio) * 100}%`, marginLeft: `${splitRatio * 100}%` }
    : undefined

  return (
    <div className={`flowlens-app mode-${mode}`} style={traceStyle}>
      <div className="drag-region" />
      {mode === 'trace' && (
        <div
          className={`split-resize-handle${draggingSplit ? ' dragging' : ''}`}
          onMouseDown={onSplitDragStart}
        />
      )}
      {mode === 'onboarding' ? (
        <OnboardingPage onLaunch={handleLaunch} onSdkMode={handleSdkMode} />
      ) : (
        <TracePage
          targetUrl={mode === 'sdk-listening' ? '' : targetUrl}
          onStop={mode === 'sdk-listening' ? handleSdkStop : handleStop}
          sdkMode={mode === 'sdk-listening'}
          sdkConnections={sdkConnections}
        />
      )}
    </div>
  )
}
