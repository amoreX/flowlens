import { useState, type FormEvent } from 'react'

interface UrlInputProps {
  onLaunch: (url: string) => void
}

function validateUrl(raw: string): { valid: boolean; url: string; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { valid: false, url: '', error: 'Enter a URL' }
  if (/\s/.test(trimmed)) return { valid: false, url: '', error: 'URL cannot contain spaces' }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    return { valid: false, url: '', error: 'Invalid URL' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, url: '', error: 'Only http/https supported' }
  }

  const host = parsed.hostname.toLowerCase()
  if (host !== 'localhost' && !/\.\w{2,}$/.test(host)) {
    return { valid: false, url: '', error: 'Enter a full domain' }
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
      <form className="url-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="url-input no-drag"
          placeholder="http://localhost:3099"
          value={url}
          onChange={(e) => { setUrl(e.target.value); if (error) setError('') }}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />
        <button type="submit" className="url-launch-btn no-drag" disabled={loading}>
          {loading ? '...' : '\u2192'}
        </button>
      </form>
      {error && <div className="url-input-error">{error}</div>}
    </div>
  )
}
