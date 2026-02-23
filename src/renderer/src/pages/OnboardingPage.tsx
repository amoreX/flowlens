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
        <h1 className="onboarding-title">
          <span>FlowLens</span>
        </h1>
        <p className="onboarding-subtitle">
          Unified visibility into frontend execution flows, network calls, and telemetry — all in one place.
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
      </div>
    </div>
  )
}
