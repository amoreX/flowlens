import { UrlInput } from '../components/UrlInput'
import '../assets/onboarding.css'

interface OnboardingPageProps {
  onLaunch: (url: string) => void
  onStartTour: () => void
  isFirstTime: boolean
}

export function OnboardingPage({ onLaunch, onStartTour, isFirstTime }: OnboardingPageProps) {
  return (
    <div className="onboarding">
      <div className="onboarding-grid" />
      <div className="onboarding-glow" />

      <div className="onboarding-content">
        <h1 className="onboarding-title">
          <span>Flow</span>Lens
        </h1>
        <p className="onboarding-subtitle">
          Paste a URL to trace execution flows, network calls, and state changes.
        </p>

        <UrlInput onLaunch={onLaunch} />

        {isFirstTime ? (
          <button className="tour-cta no-drag" onClick={onStartTour}>
            Take a Guided Tour
          </button>
        ) : (
          <button className="tour-retake no-drag" onClick={onStartTour}>
            Retake the tour
          </button>
        )}
      </div>
    </div>
  )
}
