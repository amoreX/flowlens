import { readFile } from 'node:fs/promises'
import type { SourceResponse } from '../shared/types'

const sourceCache = new Map<string, SourceResponse>()
const MAX_CACHE = 100

function cacheAndReturn(key: string, result: SourceResponse): SourceResponse {
  if (sourceCache.size >= MAX_CACHE) {
    const firstKey = sourceCache.keys().next().value
    if (firstKey) sourceCache.delete(firstKey)
  }
  sourceCache.set(key, result)
  return result
}

// ── Inline source map extraction ────────────────────────────────────

const SOURCEMAP_RE = /\/\/[#@]\s*sourceMappingURL=data:application\/json;(?:charset=[^;]+;)?base64,([A-Za-z0-9+/=]+)\s*$/

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_MAP: number[] = new Array(128).fill(-1)
for (let i = 0; i < B64.length; i++) B64_MAP[B64.charCodeAt(i)] = i

function decodeVLQ(str: string): number[] {
  const result: number[] = []
  let value = 0
  let shift = 0
  for (let i = 0; i < str.length; i++) {
    const digit = B64_MAP[str.charCodeAt(i)]
    if (digit < 0) continue
    value += (digit & 0x1f) << shift
    shift += 5
    if ((digit & 0x20) === 0) {
      result.push(value & 1 ? -(value >> 1) : value >> 1)
      value = 0
      shift = 0
    }
  }
  return result
}

function normalizePathLike(input: string): string {
  let out = input.replace(/\\/g, '/')
  out = out.replace(/^file:\/\//, '')
  out = out.replace(/[?#].*$/, '')
  out = out.replace(/\/{2,}/g, '/')
  return out
}

function pickBestSourceIndex(
  sources: string[] | undefined,
  sourcesContent: Array<string | null> | undefined,
  fileUrl: string
): number {
  if (!sources?.length || !sourcesContent?.length) return -1

  let reqPath = ''
  try {
    reqPath = normalizePathLike(new URL(fileUrl).pathname)
  } catch {
    reqPath = normalizePathLike(fileUrl)
  }
  const reqBase = reqPath.split('/').pop() ?? reqPath
  const reqSrcTail = reqPath.includes('/src/') ? reqPath.slice(reqPath.indexOf('/src/')) : reqPath

  let bestIdx = -1
  let bestScore = -1
  const n = Math.min(sources.length, sourcesContent.length)
  for (let i = 0; i < n; i++) {
    if (!sourcesContent[i]) continue
    const src = normalizePathLike(sources[i])
    const srcBase = src.split('/').pop() ?? src

    let score = -1
    if (src === reqPath) score = 4000 + src.length
    else if (src === reqSrcTail) score = 3500 + src.length
    else if (reqPath.endsWith(src)) score = 3000 + src.length
    else if (src.endsWith(reqSrcTail)) score = 2500 + reqSrcTail.length
    else if (srcBase === reqBase) score = 1500 + srcBase.length

    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  if (bestIdx >= 0) return bestIdx
  for (let i = 0; i < n; i++) {
    if (sourcesContent[i]) return i
  }
  return -1
}

function buildLineMap(
  mappings: string,
  generatedLineCount: number,
  targetSourceIndex: number
): Record<number, number> {
  const map: Record<number, number> = {}
  let origLine = 0
  let srcIdx = 0

  const lines = mappings.split(';')
  for (let genLine = 0; genLine < lines.length; genLine++) {
    const lineStr = lines[genLine]
    if (!lineStr) continue

    let lineHasMapping = false

    for (const seg of lineStr.split(',')) {
      if (!seg) continue
      const v = decodeVLQ(seg)
      if (v.length >= 4) {
        srcIdx += v[1]
        origLine += v[2]
        if (srcIdx === targetSourceIndex && !lineHasMapping) {
          map[genLine + 1] = origLine + 1
          lineHasMapping = true
        }
      }
    }
  }

  if (Object.keys(map).length === 0) return map

  // Fill gaps: lines without explicit mappings inherit previous mapped line
  let lastOrig = 1
  for (let i = 1; i <= generatedLineCount; i++) {
    if (map[i] !== undefined) {
      lastOrig = map[i]
    } else {
      map[i] = lastOrig
    }
  }

  return map
}

interface SourceMapResult {
  originalSource: string
  lineMap: Record<number, number>
}

function extractSourceMap(rawContent: string, fileUrl: string): SourceMapResult | null {
  const match = rawContent.match(SOURCEMAP_RE)
  if (!match) return null

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
    const map = JSON.parse(decoded) as {
      sources?: string[]
      sourcesContent?: string[]
      mappings?: string
    }

    if (!map.sourcesContent?.length || !map.mappings) return null

    const sourceIdx = pickBestSourceIndex(map.sources, map.sourcesContent, fileUrl)
    if (sourceIdx < 0) return null

    const originalSource = map.sourcesContent[sourceIdx]
    if (!originalSource) return null

    const generatedLineCount = rawContent.split('\n').length
    return {
      originalSource,
      lineMap: buildLineMap(map.mappings, generatedLineCount, sourceIdx)
    }
  } catch {
    return null
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function fetchSourceFile(fileUrl: string): Promise<SourceResponse> {
  const cached = sourceCache.get(fileUrl)
  if (cached) return cached

  // Local filesystem path — read directly from disk (backend files)
  if (fileUrl.startsWith('/')) {
    try {
      const content = await readFile(fileUrl, 'utf-8')
      return cacheAndReturn(fileUrl, { content, filePath: fileUrl })
    } catch (err) {
      return { filePath: fileUrl, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // file:// protocol (ESM Node.js stacks) — strip protocol and read from disk
  if (fileUrl.startsWith('file://')) {
    const localPath = fileUrl.startsWith('file:///') ? fileUrl.slice(7) : fileUrl.slice(5)
    try {
      const content = await readFile(localPath, 'utf-8')
      return cacheAndReturn(fileUrl, { content, filePath: fileUrl })
    } catch (err) {
      return { filePath: fileUrl, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // HTTP/HTTPS URL — fetch from dev server, then extract original source from source map
  try {
    const response = await fetch(fileUrl)
    if (!response.ok) {
      return { filePath: fileUrl, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const rawContent = await response.text()

    // Try to extract original source + line mapping from inline source map
    const sourceMap = extractSourceMap(rawContent, fileUrl)
    if (sourceMap) {
      return cacheAndReturn(fileUrl, {
        content: sourceMap.originalSource,
        filePath: fileUrl,
        lineMap: sourceMap.lineMap
      })
    }

    // No source map — show the raw (transformed) content as-is
    return cacheAndReturn(fileUrl, { content: rawContent, filePath: fileUrl })
  } catch (err) {
    return {
      filePath: fileUrl,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export function clearSourceCache(): void {
  sourceCache.clear()
}
