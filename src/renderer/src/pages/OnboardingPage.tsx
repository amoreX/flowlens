import { UrlInput } from '../components/UrlInput'
import '../assets/onboarding.css'

interface OnboardingPageProps {
  onLaunch: (url: string) => void
  onStartTour: () => void
  isFirstTime: boolean
}

const EXAMPLE_URLS = [
  { label: 'localhost:3099', url: 'http://localhost:3099' },
  { label: 'example.com', url: 'https://example.com' },
  { label: 'news.ycombinator.com', url: 'https://news.ycombinator.com' }
]

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

        <div className="onboarding-hints">
          {EXAMPLE_URLS.map(({ label, url }) => (
            <button key={url} className="hint-badge no-drag" onClick={() => onLaunch(url)}>
              {label}
            </button>
          ))}
        </div>

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
