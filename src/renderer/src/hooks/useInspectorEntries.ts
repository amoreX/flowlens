import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  CapturedEvent,
  StateChangeData,
  NetworkResponseData
} from '../types/events'

export interface StateChangeEntry {
  id: string
  traceId: string
  timestamp: number
  component: string
  hookIndex: number
  prevValue: string
  value: string
}

export interface ResponseEntry {
  id: string
  traceId: string
  timestamp: number
  method: string
  url: string
  status: number
  statusText: string
  duration: number
  bodyPreview?: string
}

const MAX_ENTRIES = 2000

function extractStateChange(event: CapturedEvent): StateChangeEntry | null {
  if (event.type !== 'state-change') return null
  const data = event.data as StateChangeData
  return {
    id: event.id,
    traceId: event.traceId,
    timestamp: event.timestamp,
    component: data.component,
    hookIndex: data.hookIndex,
    prevValue: data.prevValue,
    value: data.value
  }
}

function extractResponse(event: CapturedEvent): ResponseEntry | null {
  if (event.type !== 'network-response') return null
  const data = event.data as NetworkResponseData
  return {
    id: event.id,
    traceId: event.traceId,
    timestamp: event.timestamp,
    method: data.method,
    url: data.url,
    status: data.status,
    statusText: data.statusText,
    duration: data.duration,
    bodyPreview: data.bodyPreview
  }
}

function cap<T>(arr: T[]): T[] {
  return arr.length > MAX_ENTRIES ? arr.slice(-MAX_ENTRIES) : arr
}

export function useInspectorEntries() {
  const [stateChanges, setStateChanges] = useState<StateChangeEntry[]>([])
  const [responses, setResponses] = useState<ResponseEntry[]>([])
  const stateRef = useRef<StateChangeEntry[]>([])
  const respRef = useRef<ResponseEntry[]>([])

  useEffect(() => {
    window.flowlens.getAllTraces().then((traces) => {
      const sc: StateChangeEntry[] = []
      const rp: ResponseEntry[] = []
      for (const t of traces) {
        for (const ev of t.events) {
          const s = extractStateChange(ev)
          if (s) sc.push(s)
          const r = extractResponse(ev)
          if (r) rp.push(r)
        }
      }
      sc.sort((a, b) => a.timestamp - b.timestamp)
      rp.sort((a, b) => a.timestamp - b.timestamp)
      stateRef.current = cap(sc)
      respRef.current = cap(rp)
      setStateChanges(stateRef.current)
      setResponses(respRef.current)
    })

    const unsubscribe = window.flowlens.onTraceEvent((event: CapturedEvent) => {
      const s = extractStateChange(event)
      if (s) {
        stateRef.current = cap([...stateRef.current, s])
        setStateChanges(stateRef.current)
      }
      const r = extractResponse(event)
      if (r) {
        respRef.current = cap([...respRef.current, r])
        setResponses(respRef.current)
      }
    })

    return unsubscribe
  }, [])

  const clear = useCallback(() => {
    stateRef.current = []
    respRef.current = []
    setStateChanges([])
    setResponses([])
  }, [])

  const totalCount = stateChanges.length + responses.length

  return { stateChanges, responses, totalCount, clear }
}
