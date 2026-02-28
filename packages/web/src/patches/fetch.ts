import { uid, emit, getCurrentTraceId } from '../core'
import { scheduleStateDetection } from '../react/state-detector'

type Cleanup = () => void

export function patchFetch(detectReactState: boolean): Cleanup {
  const origFetch = window.fetch

  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const reqId = uid()
    const method = init?.method || 'GET'
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input?.url || String(input)
    const traceId = getCurrentTraceId()
    const start = Date.now()

    // Inject trace header for backend correlation
    if (!init) init = {}
    if (!init.headers) init.headers = {}
    if (init.headers instanceof Headers) {
      init.headers.set('X-FlowLens-Trace-Id', traceId)
    } else if (Array.isArray(init.headers)) {
      init.headers.push(['X-FlowLens-Trace-Id', traceId])
    } else {
      ;(init.headers as Record<string, string>)['X-FlowLens-Trace-Id'] = traceId
    }

    emit(
      'network-request',
      {
        requestId: reqId,
        method,
        url,
        body: init?.body ? String(init.body).slice(0, 500) : undefined
      },
      traceId
    )

    return origFetch
      .call(this, input, init)
      .then((res) => {
        const responseData: Record<string, unknown> = {
          requestId: reqId,
          method,
          url,
          status: res.status,
          statusText: res.statusText,
          duration: Date.now() - start
        }

        try {
          const clone = res.clone()
          clone
            .text()
            .then((bodyText) => {
              responseData.bodyPreview = bodyText.slice(0, 2000)
              emit('network-response', responseData, traceId)
            })
            .catch(() => {
              emit('network-response', responseData, traceId)
            })
        } catch {
          emit('network-response', responseData, traceId)
        }

        if (detectReactState) scheduleStateDetection(traceId, document.body)
        return res
      })
      .catch((err) => {
        emit(
          'network-error',
          {
            requestId: reqId,
            method,
            url,
            error: err.message || String(err),
            duration: Date.now() - start
          },
          traceId
        )
        if (detectReactState) scheduleStateDetection(traceId, document.body)
        throw err
      })
  }

  return () => {
    window.fetch = origFetch
  }
}
