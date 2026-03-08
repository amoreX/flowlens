import type { CapturedEvent, TraceData, SourceResponse, DomEventData } from '../shared/types'

interface InspectResult {
  cancelled?: boolean
  tagName?: string
  id?: string
  className?: string
  componentName?: string
  sourceFile?: string
  sourceLine?: number
}

interface FlowLensAPI {
  loadTargetUrl: (url: string) => Promise<{ success: boolean }>
  unloadTarget: () => Promise<{ success: boolean }>
  reloadTarget: () => Promise<{ success: boolean; reason?: string }>
  getAllTraces: () => Promise<TraceData[]>
  getTrace: (id: string) => Promise<TraceData | null>
  clearTraces: () => Promise<{ success: boolean }>
  fetchSource: (fileUrl: string) => Promise<SourceResponse>
  setSplitRatio: (ratio: number) => Promise<{ success: boolean }>
  highlightDomTarget: (data: DomEventData) => Promise<{ success: boolean; reason?: string }>
  onTraceEvent: (callback: (event: CapturedEvent) => void) => () => void
  onTargetLoaded: (callback: (url: string) => void) => () => void
  startInspect: () => Promise<InspectResult>
  stopInspect: () => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    flowlens: FlowLensAPI
  }
}
