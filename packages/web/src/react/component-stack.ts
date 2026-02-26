/**
 * Walks the React fiber tree to extract component source locations.
 * Supports React 19 (_debugStack) and React 18 (_debugSource).
 */
export function getReactComponentStack(element: Element | null): string {
  if (!element) return ''
  try {
    let fiberKey: string | null = null
    const keys = Object.keys(element)
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber$') === 0) {
        fiberKey = keys[i]
        break
      }
    }
    if (!fiberKey) return ''

    const collectedStacks: string[] = []
    const seen: Record<string, boolean> = {}
    let f = (element as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null
    let count = 0

    while (f && count < 15) {
      count++

      // React 19: _debugStack is an Error object whose .stack contains
      // the V8 call stack from where the JSX element was created.
      const debugStack = f._debugStack as { stack?: string } | undefined
      if (debugStack?.stack) {
        const stackLines = debugStack.stack.split('\n')
        for (let j = 0; j < stackLines.length; j++) {
          const line = stackLines[j]
          if (line.indexOf('    at ') !== 0) continue
          if (line.indexOf('node_modules') >= 0) continue
          if (line.indexOf('.vite/deps') >= 0) continue
          if (line.indexOf('__flowlens') >= 0) continue
          if (line.indexOf('react-stack-top-frame') >= 0) continue
          if (!seen[line]) {
            seen[line] = true
            collectedStacks.push(line)
          }
        }
      }

      // React 18 fallback: _debugSource has fileName/lineNumber directly
      const debugSource = f._debugSource as {
        fileName: string
        lineNumber: number
        columnNumber?: number
      } | undefined
      if (debugSource) {
        let fileName = debugSource.fileName
        if (fileName.indexOf('://') === -1) {
          const srcIdx = fileName.indexOf('/src/')
          if (srcIdx >= 0) fileName = location.origin + fileName.slice(srcIdx)
          else if (fileName.charAt(0) === '/') fileName = location.origin + fileName
          else fileName = location.origin + '/' + fileName
        }
        let name = 'Component'
        const fType = f.type as ((...args: unknown[]) => unknown) & {
          displayName?: string
          name?: string
        } | string | undefined
        if (fType) {
          if (typeof fType === 'string') name = '<' + fType + '>'
          else if (fType.displayName || fType.name) name = fType.displayName || fType.name || name
        }
        const frame =
          '    at ' +
          name +
          ' (' +
          fileName +
          ':' +
          debugSource.lineNumber +
          ':' +
          (debugSource.columnNumber || 1) +
          ')'
        if (!seen[frame]) {
          seen[frame] = true
          collectedStacks.push(frame)
        }
      }

      f = f.return as Record<string, unknown> | null
    }

    return collectedStacks.join('\n')
  } catch {
    return ''
  }
}
