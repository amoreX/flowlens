import { useState, type FormEvent } from 'react'

interface UrlInputProps {
  onLaunch: (url: string) => void
}

interface ValidationResult {
  valid: boolean
  url: string
  error: string
}

function validateUrl(raw: string): ValidationResult {
  const trimmed = raw.trim()

  if (!trimmed) {
    return { valid: false, url: '', error: 'Enter a URL to get started' }
  }

  if (/\s/.test(trimmed)) {
    return { valid: false, url: '', error: 'URL cannot contain spaces' }
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    return { valid: false, url: '', error: 'That doesn\u2019t look like a valid URL' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, url: '', error: 'Only http:// and https:// URLs are supported' }
  }

  const host = parsed.hostname.toLowerCase()
  if (host !== 'localhost' && !/\.\w{2,}$/.test(host)) {
    return { valid: false, url: '', error: 'Enter a full domain (e.g. example.com)' }
  }

  if (/^(file|ftp|mailto|tel|javascript):/i.test(trimmed)) {
    return { valid: false, url: '', error: 'Only http/https URLs are supported' }
  }

  return { valid: true, url: parsed.href, error: '' }
}

export function UrlInput({ onLaunch }: UrlInputProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = validateUrl(url)

    if (!result.valid) {
      setError(result.error)
      return
    }

    setError('')
    setLoading(true)
    onLaunch(result.url)
  }

  return (
    <div className="url-input-wrapper">
      <form className="url-input-group" onSubmit={handleSubmit}>
        <div className="input-field">
          <label className="input-label">Dev Server URL</label>
          <input
            type="text"
            className="url-input no-drag"
            placeholder="http://localhost:3099"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (error) setError('')
            }}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
        <button type="submit" className="url-launch-btn no-drag" disabled={loading}>
          {loading ? 'Loading...' : 'Launch'}
        </button>
      </form>
      <div className="input-hint">
        Source code is loaded from your dev server. Backend source files are resolved automatically from stack traces.
      </div>
      {error && <div className="url-input-error">{error}</div>}
    </div>
  )
}
