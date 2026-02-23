import type { CapturedEvent, TraceData } from '../shared/types'

interface FlowLensAPI {
  loadTargetUrl: (url: string) => Promise<{ success: boolean }>
  unloadTarget: () => Promise<{ success: boolean }>
  getAllTraces: () => Promise<TraceData[]>
  getTrace: (id: string) => Promise<TraceData | null>
  clearTraces: () => Promise<{ success: boolean }>
  onTraceEvent: (callback: (event: CapturedEvent) => void) => () => void
  onTargetLoaded: (callback: (url: string) => void) => () => void
}

declare global {
  interface Window {
    flowlens: FlowLensAPI
  }
}
