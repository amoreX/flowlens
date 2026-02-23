import type { SourceLocation } from '../types/events'

// Chrome V8 stack frame format (browser — http/https URLs):
// "    at functionName (http://localhost:3099/src/App.tsx:15:5)"
// "    at http://localhost:3099/src/App.tsx:15:5"
const CHROME_FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(https?:\/\/.+?):(\d+):(\d+)\)?\s*$/

// Node.js V8 stack frame format (filesystem paths):
// "    at functionName (/Users/nihal/code/test-back/server.js:10:30)"
// "    at /Users/nihal/code/test-back/server.js:10:30"
const NODE_FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(\/[^\s:]+):(\d+):(\d+)\)?\s*$/

// Node.js ESM stack frame format (file:// URLs):
// "    at functionName (file:///Users/nihal/code/test-back/server.js:10:30)"
// "    at file:///Users/nihal/code/test-back/server.js:10:30"
const FILE_FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(file:\/\/.+?):(\d+):(\d+)\)?\s*$/

function matchFrame(line: string): RegExpMatchArray | null {
  return line.match(CHROME_FRAME_RE) || line.match(NODE_FRAME_RE) || line.match(FILE_FRAME_RE)
}

export function parseUserSourceLocation(stack: string | undefined): SourceLocation | null {
  if (!stack) return null

  const lines = stack.split(/\r?\n/)

  for (const line of lines) {
    const match = matchFrame(line)
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
  const lines = stack.split(/\r?\n/)

  for (const line of lines) {
    const match = matchFrame(line)
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

function isInstrumentationFrame(filePath: string, _functionName?: string): boolean {
  if (filePath.includes('__flowlens_instrumentation__')) return true

  if (/^(devtools|chrome-extension|chrome):\/\//.test(filePath)) return true

  if (/^VM\d+/.test(filePath)) return true

  if (/node_modules|\.vite\/deps/.test(filePath)) return true

  if (filePath.startsWith('node:')) return true

  return false
}

export function extractDisplayPath(fullUrl: string): string {
  // Local filesystem path — show last 2 segments (e.g. "test-back/server.js")
  if (fullUrl.startsWith('/')) {
    const parts = fullUrl.split('/')
    return parts.slice(-2).join('/')
  }

  // file:// protocol — strip protocol, then show last 2 segments
  if (fullUrl.startsWith('file://')) {
    const stripped = fullUrl.startsWith('file:///') ? fullUrl.slice(7) : fullUrl.slice(5)
    const parts = stripped.split('/')
    return parts.slice(-2).join('/')
  }

  try {
    const url = new URL(fullUrl)
    return url.pathname.replace(/^\//, '')
  } catch {
    return fullUrl
  }
}
