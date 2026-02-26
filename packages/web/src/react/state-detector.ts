import { emit } from '../core'

const emittedStateSignatures: Record<string, string> = {}

/**
 * Schedule state detection at multiple delays to catch async re-renders.
 */
export function scheduleStateDetection(
  traceId: string,
  element: Element | null
): void {
  const target = element || document.body
  const delays = [0, 40, 140]
  for (const delay of delays) {
    setTimeout(() => detectStateChanges(target, traceId), delay)
  }
}

function getFiberRootFromElement(
  element: Element | null
): Record<string, unknown> | null {
  if (!element) return null
  let el: Element | null = element
  while (el) {
    const keys = Object.keys(el)
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber$') === 0) {
        let fiber = (el as Record<string, unknown>)[keys[i]] as Record<string, unknown>
        let root = fiber
        while (root && (root as Record<string, unknown>).return) {
          root = (root as Record<string, unknown>).return as Record<string, unknown>
        }
        const stateNode = root?.stateNode as Record<string, unknown> | undefined
        if (stateNode?.current) return stateNode
      }
    }
    el = el.parentElement
  }
  return null
}

function findFiberRoot(element: Element | null): Record<string, unknown> | null {
  const root = getFiberRootFromElement(element)
  if (root) return root

  const body = document.body
  if (!body?.querySelectorAll) return null
  const nodes = body.querySelectorAll('*')
  for (let i = 0; i < nodes.length; i++) {
    const r = getFiberRootFromElement(nodes[i])
    if (r) return r
  }
  return null
}

function getFiberSourceStack(f: Record<string, unknown>): string {
  const debugStack = f._debugStack as { stack?: string } | undefined
  if (debugStack?.stack) {
    return debugStack.stack
  }
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
      else if (typeof fType !== 'string' && (fType.displayName || fType.name))
        name = fType.displayName || fType.name || name
    }
    return (
      '    at ' +
      name +
      ' (' +
      fileName +
      ':' +
      debugSource.lineNumber +
      ':' +
      (debugSource.columnNumber || 1) +
      ')'
    )
  }
  return ''
}

function detectStateChanges(element: Element, traceId: string): void {
  try {
    const fiberRoot = findFiberRoot(element)
    if (!fiberRoot) return

    const seen: Record<string, boolean> = {}

    function walkFiber(f: Record<string, unknown> | null): void {
      if (!f) return

      if (
        typeof f.type === 'function' &&
        f.memoizedState !== null &&
        f.alternate !== null
      ) {
        const fType = f.type as { displayName?: string; name?: string }
        const componentName = fType.displayName || fType.name || 'Anonymous'

        let currentHook = f.memoizedState as Record<string, unknown> | null
        let alternateHook = (f.alternate as Record<string, unknown>)
          .memoizedState as Record<string, unknown> | null
        let hookIdx = 0

        while (currentHook && alternateHook) {
          const queue = currentHook.queue as Record<string, unknown> | null
          if (queue && typeof queue.dispatch === 'function') {
            const curVal = currentHook.memoizedState
            const prevVal = alternateHook.memoizedState

            if (!Object.is(curVal, prevVal)) {
              const key = componentName + ':' + hookIdx
              if (!seen[key]) {
                seen[key] = true

                const sourceStack = getFiberSourceStack(f)

                let prevStr: string
                let curStr: string
                try {
                  prevStr = JSON.stringify(prevVal)
                } catch {
                  prevStr = String(prevVal)
                }
                try {
                  curStr = JSON.stringify(curVal)
                } catch {
                  curStr = String(curVal)
                }

                const emittedKey = traceId + ':' + key
                const signature = prevStr + '->' + curStr
                if (emittedStateSignatures[emittedKey] === signature) {
                  hookIdx++
                  currentHook = currentHook.next as Record<string, unknown> | null
                  alternateHook = alternateHook.next as Record<string, unknown> | null
                  continue
                }
                emittedStateSignatures[emittedKey] = signature

                emit(
                  'state-change',
                  {
                    component: componentName,
                    hookIndex: hookIdx,
                    prevValue: prevStr,
                    value: curStr
                  },
                  traceId,
                  sourceStack
                )
              }
            }
          }

          hookIdx++
          currentHook = currentHook.next as Record<string, unknown> | null
          alternateHook = alternateHook.next as Record<string, unknown> | null
        }
      }

      walkFiber(f.child as Record<string, unknown> | null)
      walkFiber(f.sibling as Record<string, unknown> | null)
    }

    walkFiber(fiberRoot.current as Record<string, unknown> | null)
  } catch {
    // State detection is best-effort
  }
}
