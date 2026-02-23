import { useState, useCallback } from 'react'
import { OnboardingPage } from './pages/OnboardingPage'
import { TracePage } from './pages/TracePage'

type AppMode = 'onboarding' | 'trace'

export default function App() {
  const [mode, setMode] = useState<AppMode>('onboarding')
  const [targetUrl, setTargetUrl] = useState('')

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

  return (
    <div className={`flowlens-app mode-${mode}`}>
      <div className="drag-region" />
      {mode === 'onboarding' ? (
        <OnboardingPage onLaunch={handleLaunch} />
      ) : (
        <TracePage targetUrl={targetUrl} onStop={handleStop} />
      )}
    </div>
  )
}
