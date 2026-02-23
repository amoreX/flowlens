import { UrlInput } from '../components/UrlInput'
import '../assets/onboarding.css'

interface OnboardingPageProps {
  onLaunch: (url: string) => void
}

const EXAMPLE_URLS = [
  'https://example.com',
  'https://news.ycombinator.com',
  'https://jsonplaceholder.typicode.com'
]

export function OnboardingPage({ onLaunch }: OnboardingPageProps) {
  return (
    <div className="onboarding">
      <div className="onboarding-grid" />
      <div className="onboarding-glow" />

      <div className="onboarding-content">
        <div className="onboarding-badge">Developer Tool</div>
        <h1 className="onboarding-title">
          <span>Flow</span>Lens
        </h1>
        <p className="onboarding-subtitle">
          Trace frontend execution flows, network calls, and console output — all in one unified timeline. Paste a URL to start debugging.
        </p>
        <UrlInput onLaunch={onLaunch} />
        <div className="onboarding-hints">
          {EXAMPLE_URLS.map((url) => (
            <button
              key={url}
              className="hint-badge no-drag"
              onClick={() => onLaunch(url)}
            >
              {url.replace('https://', '')}
            </button>
          ))}
        </div>
        <div className="onboarding-features">
          <div className="onboarding-feature">
            <span className="feature-dot" style={{ background: 'var(--accent)' }} />
            <span>DOM + Network tracing</span>
          </div>
          <div className="onboarding-feature">
            <span className="feature-dot" style={{ background: 'var(--blue)' }} />
            <span>Source code mapping</span>
          </div>
          <div className="onboarding-feature">
            <span className="feature-dot" style={{ background: 'var(--green)' }} />
            <span>Live console capture</span>
          </div>
        </div>
      </div>
    </div>
  )
}
