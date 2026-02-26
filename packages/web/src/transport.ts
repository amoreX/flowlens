import type { CapturedEvent } from './types'

let ws: WebSocket | null = null
let endpoint = 'ws://localhost:9230'
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
const MAX_RECONNECT_DELAY = 10000
const MAX_QUEUE = 500

const queue: string[] = []
let destroyed = false

export function connect(url?: string): void {
  if (url) endpoint = url
  destroyed = false
  attemptConnect()
}

function attemptConnect(): void {
  if (destroyed) return

  try {
    ws = new WebSocket(endpoint)
  } catch {
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    reconnectDelay = 1000
    // Send hello message
    ws?.send(JSON.stringify({ type: 'hello', payload: { userAgent: navigator.userAgent } }))
    // Flush queued events
    while (queue.length > 0) {
      const msg = queue.shift()!
      ws?.send(msg)
    }
  }

  ws.onclose = () => {
    ws = null
    scheduleReconnect()
  }

  ws.onerror = () => {
    // onclose will fire after this
  }
}

function scheduleReconnect(): void {
  if (destroyed || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    attemptConnect()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
}

export function send(event: CapturedEvent): void {
  const msg = JSON.stringify({ type: 'event', payload: { event } })

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg)
  } else {
    queue.push(msg)
    if (queue.length > MAX_QUEUE) {
      queue.shift() // drop oldest
    }
  }
}

export function disconnect(): void {
  destroyed = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
  queue.length = 0
}
