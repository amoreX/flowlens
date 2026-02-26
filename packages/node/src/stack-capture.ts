/**
 * Captures a V8 stack trace, stripping FlowLens instrumentation frames.
 */
export function captureStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined

  const lines = stack.split('\n')
  const filtered = lines.filter((line) => {
    // Keep the "Error" header line
    if (!line.trimStart().startsWith('at ')) return true
    // Strip @flowlens/node internals
    if (line.includes('@flowlens/node')) return false
    if (line.includes('__flowlens_sdk__')) return false
    if (line.includes('node_modules')) return false
    return true
  })

  return filtered.length > 1 ? filtered.join('\n') : undefined
}
