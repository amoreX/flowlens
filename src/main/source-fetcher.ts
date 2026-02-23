import type { SourceResponse } from '../shared/types'

const sourceCache = new Map<string, SourceResponse>()
const MAX_CACHE = 100

export async function fetchSourceFile(fileUrl: string): Promise<SourceResponse> {
  const cached = sourceCache.get(fileUrl)
  if (cached) return cached

  try {
    const response = await fetch(fileUrl)
    if (!response.ok) {
      return { filePath: fileUrl, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const content = await response.text()
    const result: SourceResponse = { content, filePath: fileUrl }

    if (sourceCache.size >= MAX_CACHE) {
      const firstKey = sourceCache.keys().next().value
      if (firstKey) sourceCache.delete(firstKey)
    }

    sourceCache.set(fileUrl, result)
    return result
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
