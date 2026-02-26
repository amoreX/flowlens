import { emit, getCurrentTraceId } from '../core'
import { scheduleStateDetection } from '../react/state-detector'

type Cleanup = () => void

const LEVELS = ['log', 'warn', 'error', 'info', 'debug'] as const

export function patchConsole(detectReactState: boolean): Cleanup {
  const originals = new Map<string, (...args: unknown[]) => void>()

  for (const level of LEVELS) {
    const orig = console[level]
    originals.set(level, orig)

    console[level] = function (...args: unknown[]) {
      const serialized = args.map((a) => {
        try {
          return typeof a === 'string' ? a : JSON.stringify(a)
        } catch {
          return String(a)
        }
      })
      emit('console', { level, args: serialized })
      if (detectReactState) scheduleStateDetection(getCurrentTraceId(), document.body)
      return orig.apply(console, args)
    }
  }

  return () => {
    for (const [level, orig] of originals) {
      ;(console as Record<string, unknown>)[level] = orig
    }
  }
}
