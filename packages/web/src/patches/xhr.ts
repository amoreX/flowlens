import { uid, emit, getCurrentTraceId } from '../core'
import { scheduleStateDetection } from '../react/state-detector'

type Cleanup = () => void

interface InstrumentedXHR extends XMLHttpRequest {
  __fl_method?: string
  __fl_url?: string
  __fl_reqId?: string
  __fl_traceId?: string
}

export function patchXHR(detectReactState: boolean): Cleanup {
  const origOpen = XMLHttpRequest.prototype.open
  const origSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (
    this: InstrumentedXHR,
    method: string,
    url: string | URL
  ) {
    this.__fl_method = method
    this.__fl_url = String(url)
    this.__fl_reqId = uid()
    this.__fl_traceId = getCurrentTraceId()
    // eslint-disable-next-line prefer-rest-params
    return origOpen.apply(this, arguments as unknown as Parameters<typeof origOpen>)
  }

  XMLHttpRequest.prototype.send = function (
    this: InstrumentedXHR,
    body?: Document | XMLHttpRequestBodyInit | null
  ) {
    const xhr = this
    const start = Date.now()

    // Inject trace header for backend correlation
    try {
      xhr.setRequestHeader('X-FlowLens-Trace-Id', xhr.__fl_traceId || '')
    } catch {
      // ignore — may fail if state is not OPENED
    }

    emit(
      'network-request',
      {
        requestId: xhr.__fl_reqId,
        method: xhr.__fl_method,
        url: xhr.__fl_url,
        body: body ? String(body).slice(0, 500) : undefined
      },
      xhr.__fl_traceId
    )

    xhr.addEventListener('load', () => {
      let bodyPreview: string | undefined
      try {
        bodyPreview = (xhr.responseText || '').slice(0, 2000)
      } catch {
        // ignore response body extraction failures
      }

      emit(
        'network-response',
        {
          requestId: xhr.__fl_reqId,
          method: xhr.__fl_method,
          url: xhr.__fl_url,
          status: xhr.status,
          statusText: xhr.statusText,
          duration: Date.now() - start,
          bodyPreview
        },
        xhr.__fl_traceId
      )
      if (detectReactState) scheduleStateDetection(xhr.__fl_traceId!, document.body)
    })

    xhr.addEventListener('error', () => {
      emit(
        'network-error',
        {
          requestId: xhr.__fl_reqId,
          method: xhr.__fl_method,
          url: xhr.__fl_url,
          error: 'XHR error',
          duration: Date.now() - start
        },
        xhr.__fl_traceId
      )
      if (detectReactState) scheduleStateDetection(xhr.__fl_traceId!, document.body)
    })

    // eslint-disable-next-line prefer-rest-params
    return origSend.apply(this, arguments as unknown as Parameters<typeof origSend>)
  }

  return () => {
    XMLHttpRequest.prototype.open = origOpen
    XMLHttpRequest.prototype.send = origSend
  }
}
