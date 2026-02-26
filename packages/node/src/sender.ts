import http from 'node:http'
import type { SpanPayload } from './types'

const TIMEOUT_MS = 500

/**
 * Fire-and-forget POST to FlowLens span collector.
 * Uses node:http (zero dependencies). Errors are silently swallowed.
 */
export function sendSpan(collectorUrl: string, payload: SpanPayload): void {
  try {
    const url = new URL(collectorUrl)
    const body = JSON.stringify(payload)

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 9229,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: TIMEOUT_MS
      },
      (res) => {
        // Drain response to free socket
        res.resume()
      }
    )

    req.on('error', () => {
      // Silently swallow — FlowLens may not be running
    })

    req.on('timeout', () => {
      req.destroy()
    })

    req.write(body)
    req.end()
  } catch {
    // Silently swallow
  }
}
