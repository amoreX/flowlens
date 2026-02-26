import { emit } from '../core'

type Cleanup = () => void

export function patchErrors(): Cleanup {
  const onError = (e: ErrorEvent): void => {
    emit('error', {
      message: e.message || 'Unknown error',
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error?.stack || undefined,
      type: 'error'
    })
  }

  const onRejection = (e: PromiseRejectionEvent): void => {
    const reason = e.reason || {}
    emit('error', {
      message: reason.message || String(reason) || 'Unhandled rejection',
      stack: reason.stack || undefined,
      type: 'unhandledrejection'
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
