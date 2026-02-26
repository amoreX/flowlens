import type { FlowLensWebConfig } from './types'
import { connect, disconnect } from './transport'
import { patchDOM } from './patches/dom'
import { patchFetch } from './patches/fetch'
import { patchXHR } from './patches/xhr'
import { patchConsole } from './patches/console'
import { patchErrors } from './patches/errors'

export type { FlowLensWebConfig, CapturedEvent, EventType } from './types'

let active = false
const cleanups: Array<() => void> = []

declare global {
  interface Window {
    __flowlens_instrumented?: boolean
  }
}

/**
 * Initialize FlowLens instrumentation. Patches fetch, XHR, console, DOM events,
 * window errors, and React state detection. Connects to FlowLens via WebSocket.
 *
 * ```ts
 * import { init } from '@flowlens/web'
 * if (import.meta.env.DEV) {
 *   init()
 * }
 * ```
 */
export function init(config?: FlowLensWebConfig): void {
  if (active || window.__flowlens_instrumented) return
  if (config?.enabled === false) return

  active = true
  window.__flowlens_instrumented = true

  const detectReact = config?.detectReactState !== false

  // Connect WebSocket transport
  connect(config?.endpoint)

  // Apply patches
  if (config?.patchDOM !== false) {
    cleanups.push(patchDOM(detectReact))
  }
  if (config?.patchFetch !== false) {
    cleanups.push(patchFetch(detectReact))
  }
  if (config?.patchXHR !== false) {
    cleanups.push(patchXHR(detectReact))
  }
  if (config?.patchConsole !== false) {
    cleanups.push(patchConsole(detectReact))
  }
  if (config?.captureErrors !== false) {
    cleanups.push(patchErrors())
  }
}

/**
 * Tear down all instrumentation and close the WebSocket connection.
 */
export function destroy(): void {
  if (!active) return
  active = false
  window.__flowlens_instrumented = false

  for (const cleanup of cleanups) {
    try {
      cleanup()
    } catch {
      // best-effort
    }
  }
  cleanups.length = 0

  disconnect()
}

/**
 * Check if FlowLens instrumentation is currently active.
 */
export function isActive(): boolean {
  return active
}
