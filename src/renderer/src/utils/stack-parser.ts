import type { SourceLocation } from '../types/events'

// Chrome V8 stack frame format:
// "    at functionName (http://localhost:3099/src/App.tsx:15:5)"
// "    at http://localhost:3099/src/App.tsx:15:5"
const CHROME_FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(https?:\/\/.+?):(\d+):(\d+)\)?$/

export function parseUserSourceLocation(stack: string | undefined): SourceLocation | null {
  if (!stack) return null

  const lines = stack.split('\n')

  for (const line of lines) {
    const match = line.match(CHROME_FRAME_RE)
    if (!match) continue

    const [, functionName, filePath, lineStr, colStr] = match

    if (isInstrumentationFrame(filePath, functionName)) continue

    return {
      filePath,
      line: parseInt(lineStr, 10),
      column: parseInt(colStr, 10),
      functionName: functionName || undefined
    }
  }

  return null
}

export function parseAllUserFrames(stack: string | undefined): SourceLocation[] {
  if (!stack) return []

  const frames: SourceLocation[] = []
  const lines = stack.split('\n')

  for (const line of lines) {
    const match = line.match(CHROME_FRAME_RE)
    if (!match) continue

    const [, functionName, filePath, lineStr, colStr] = match

    if (isInstrumentationFrame(filePath, functionName)) continue

    frames.push({
      filePath,
      line: parseInt(lineStr, 10),
      column: parseInt(colStr, 10),
      functionName: functionName || undefined
    })
  }

  return frames
}

function isInstrumentationFrame(filePath: string, functionName?: string): boolean {
  // The IIFE is tagged with sourceURL=__flowlens_instrumentation__
  if (filePath.includes('__flowlens_instrumentation__')) return true

  // Skip browser internal URLs
  if (/^(devtools|chrome-extension|chrome):\/\//.test(filePath)) return true

  // Skip VM-injected scripts
  if (/^VM\d+/.test(filePath)) return true

  // Known instrumentation function names
  if (functionName === 'send' || functionName === 'uid') return true

  return false
}

export function extractDisplayPath(fullUrl: string): string {
  try {
    const url = new URL(fullUrl)
    return url.pathname.replace(/^\//, '')
  } catch {
    return fullUrl
  }
}
