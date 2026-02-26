import { emit, newTraceId, getCurrentTraceId } from '../core'
import { getReactComponentStack } from '../react/component-stack'
import { scheduleStateDetection } from '../react/state-detector'

const DOM_EVENTS = ['click', 'input', 'submit', 'change', 'focus', 'blur'] as const

type Cleanup = () => void

export function patchDOM(detectReactState: boolean): Cleanup {
  const controllers: Array<{ type: string; handler: (e: Event) => void }> = []

  for (const evtType of DOM_EVENTS) {
    const handler = (e: Event): void => {
      if (evtType === 'click' || evtType === 'submit') {
        newTraceId()
      }

      const el = e.target as HTMLElement | null
      const traceId = getCurrentTraceId()
      const componentStack = getReactComponentStack(el)

      emit(
        'dom',
        {
          eventType: evtType,
          target: el
            ? (el.tagName || '') +
              (el.id ? '#' + el.id : '') +
              (el.className
                ? '.' + String(el.className).split(' ').join('.')
                : '')
            : '',
          tagName: el ? el.tagName || '' : '',
          id: el ? el.id || undefined : undefined,
          className: el ? String(el.className || '') : '',
          textContent:
            el && el.textContent ? el.textContent.slice(0, 100) : undefined,
          value:
            el && (el as HTMLInputElement).value !== undefined
              ? String((el as HTMLInputElement).value).slice(0, 100)
              : undefined
        },
        traceId,
        componentStack
      )

      if (
        detectReactState &&
        (evtType === 'click' ||
          evtType === 'submit' ||
          evtType === 'change' ||
          evtType === 'input')
      ) {
        scheduleStateDetection(traceId, el)
      }
    }

    document.addEventListener(evtType, handler, true)
    controllers.push({ type: evtType, handler })
  }

  return () => {
    for (const { type, handler } of controllers) {
      document.removeEventListener(type, handler, true)
    }
  }
}
