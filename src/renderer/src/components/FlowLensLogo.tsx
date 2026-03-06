import '../assets/logo.css'

export function FlowLensLogo() {
  return (
    <div className="flowlens-logo">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
        className="flowlens-logo-svg"
      >
        {/* Aperture blades */}
        <circle cx="12" cy="12" r="10" className="logo-ring" />
        <path d="M14.31 8l5.74 9.94" className="logo-blade" />
        <path d="M9.69 8h11.48" className="logo-blade" />
        <path d="M7.38 12l5.74-9.94" className="logo-blade" />
        <path d="M9.69 16L3.95 6.06" className="logo-blade" />
        <path d="M14.31 16H2.83" className="logo-blade" />
        <path d="M16.62 12l-5.74 9.94" className="logo-blade" />
      </svg>
      <span className="flowlens-logo-text">FlowLens</span>
    </div>
  )
}
