import '../assets/logo.css'

export function FlowLensLogo() {
  return (
    <div className="flowlens-logo">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flowlens-logo-svg"
      >
        {/* Outer Lens shape */}
        <path
          d="M2 12C2 12 7 4 12 4C17 4 22 12 22 12C22 12 17 20 12 20C7 20 2 12 2 12Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="logo-lens"
        />
        {/* Inner pulsing core */}
        <circle cx="12" cy="12" r="3" fill="currentColor" className="logo-core" />
        {/* Data wave line cutting through */}
        <path
          d="M0 12C4 8 8 16 12 12C16 8 20 16 24 12"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="logo-wave"
        />
      </svg>
      <span className="flowlens-logo-text">FlowLens</span>
    </div>
  )
}
