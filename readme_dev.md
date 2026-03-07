# FlowLens — Developer Guide

This guide reflects the current codebase, including the package-based frontend instrumentation.

## Overview

FlowLens runs in two modes:

- **Embedded mode**: load a URL in a sandboxed `WebContentsView`.
- **SDK mode**: no embedded page; external apps send events via `@nihal/flowlens-web` and `@nihal/flowlens-node`.

At app boot, the main process starts:

- Span collector: `http://localhost:9229`
- WebSocket server: `ws://localhost:9230`

Both feeds are ingested into the same trace engine and forwarded to the renderer.

---

## Core Structure

```text
src/
  main/
    index.ts
    window-manager.ts
    target-view.ts
    trace-correlation-engine.ts
    span-collector.ts
    ws-server.ts
    source-fetcher.ts
    ipc-handlers.ts
  preload/
    index.ts              (renderer window.flowlens API)
    index.d.ts            (type declarations)
    target-preload.ts     (target view bridge)
  renderer/src/
    App.tsx
    pages/
      OnboardingPage.tsx
      TracePage.tsx
    components/
      ConsolePanel.tsx
      EventBadge.tsx        (event type badges used in TraceGroup)
      EventDetailPanel.tsx
      FlowLensLogo.tsx
      FlowNavigator.tsx
      InspectorPanel.tsx
      SourceCodePanel.tsx
      SourceCodeViewer.tsx  (syntax-highlighted code viewer used by EventDetailPanel)
      StatusBar.tsx         (unused — legacy component)
      Timeline.tsx
      TimelineEvent.tsx
      TraceGroup.tsx
      UrlInput.tsx          (URL input used by OnboardingPage)
    hooks/
      useTraceEvents.ts
      useSourceHitMap.ts
      useConsoleEntries.ts
      useInspectorEntries.ts
    utils/
      stack-parser.ts
      syntax.ts
    assets/
  shared/types.ts
packages/
  web/    (@nihal/flowlens-web)
  node/   (@nihal/flowlens-node)
```

---

## Architecture

### Main process

- Owns `TraceCorrelationEngine` (500 trace LRU)
- Hosts backend span collector (`:9229`)
- Hosts WS ingestion server (`:9230`)
- Manages embedded target view and split bounds
- Source file cache (100-entry, FIFO eviction)
- Pushes live events to renderer via `trace:event-received`

### Target view (embedded mode)

- Loads user URL in sandboxed `WebContentsView`
- Injects **built bundle** from `packages/web/dist/browser.global.js`
- Calls `window.FlowLensWeb.init({ endpoint: 'ws://localhost:9230', ... })`
- Emits SPA navigation events from `did-navigate-in-page`
- Supports DOM element highlighting via `target:highlight-dom` IPC

### Renderer

- Timeline + source panel + flow navigator + bottom tabs (Console/Inspector)
- Bottom header contains Console/Inspector tabs and right-side URL/SDK status/Exit
- Uses hooks:
  - `useTraceEvents` — subscribe-first live stream + snapshot merge, dedup by event.id
  - `useSourceHitMap` — per-file/line hit tracking, source cache, auto-fetch
  - `useConsoleEntries` — console/error event filtering (2000 entry cap)
  - `useInspectorEntries` — state changes + network responses for inspector tab

### App modes

`App.tsx` manages three modes, but only two page components:

| Mode | Page component | Description |
|------|---------------|-------------|
| `onboarding` | `OnboardingPage` | URL input + SDK Mode button |
| `trace` | `TracePage` | Split view — embedded site left, tracing UI right |
| `sdk-listening` | `TracePage` (with `sdkMode={true}`) | Full-width tracing UI, no embedded page |

---

## Event Flow

```text
frontend (@nihal/flowlens-web) --WS:9230--> ws-server.ts --\
                                                    +--> trace-engine --> renderer
backend (@nihal/flowlens-node) ----HTTP:9229--> span-collector --/
```

### Frontend event types

- `dom`
- `network-request`
- `network-response` (includes `bodyPreview`)
- `network-error`
- `console`
- `error`
- `state-change`

### Backend span flow

`span-collector.ts` transforms one backend span into three events:

- `backend-span` `phase: request` (`step: ingress`)
- `backend-span` `phase: handler` (`step: route-handler`)
- `backend-span` `phase: response` (`step: egress`)

Supports `phaseStacks`, `requestStack/handlerStack/responseStack`, and fallback `sourceStack`.

---

## Instrumentation Notes

FlowLens no longer uses the old large inline IIFE patch logic.
Instead, `target-view.ts` injects the built package bundle and initializes `FlowLensWeb`.

For safety:

- If bundle is missing, target view logs a warning:
  - `@nihal/flowlens-web browser bundle not found`
- Source parser filters SDK frames (`@nihal/flowlens-web`, `@nihal/flowlens-node`, `flowlens/packages/*`, `flowlens-web/dist`, `flowlens-node/dist`, `__flowlens_sdk__`, `__flowlens_instrumentation__`) so UI shows user code only.

---

## IPC Surface (renderer preload)

All channels are exposed via `window.flowlens` in `preload/index.ts`.

### Invoke channels (async request-response)

| Channel | API method | Purpose |
|---------|-----------|---------|
| `target:load-url` | `loadTargetUrl(url)` | Create target view, load URL |
| `target:unload` | `unloadTarget()` | Destroy target view, clear traces and source cache |
| `target:reload` | `reloadTarget()` | Reload the current target page |
| `target:set-split` | `setSplitRatio(ratio)` | Adjust left/right split ratio |
| `target:highlight-dom` | `highlightDomTarget(data)` | Highlight a DOM element in target view |
| `trace:get-all` | `getAllTraces()` | Fetch all stored traces |
| `trace:get` | `getTrace(id)` | Fetch single trace by ID |
| `trace:clear` | `clearTraces()` | Clear all traces |
| `source:fetch` | `fetchSource(fileUrl)` | Fetch source file (disk/HTTP + source map extraction) |
| `sdk:start-listening` | `startSdkMode()` | Enter SDK mode (returns `{ success, connectedClients }`) |
| `sdk:stop-listening` | `stopSdkMode()` | Exit SDK mode (clears traces + source cache) |
| `sdk:get-connection-count` | `getSdkConnectionCount()` | Get current WebSocket client count |

### Subscribe channels (main → renderer push)

| Channel | API method | Purpose |
|---------|-----------|---------|
| `trace:event-received` | `onTraceEvent(cb)` | Live event stream |
| `target:loaded` | `onTargetLoaded(cb)` | Target page finished loading |
| `sdk:connection-count` | `onSdkConnectionCount(cb)` | Live SDK connection count updates |

Note: `ws-server.ts` also sends `sdk:connected` and `sdk:disconnected` to the renderer window directly (not exposed as subscribe methods in the preload API).

---

## Development Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Current script behavior:

- `npm run dev` builds `@nihal/flowlens-web` first (`build:web-sdk`) then runs Electron dev.
- `npm run build` builds `@nihal/flowlens-web`, typechecks, then builds Electron app.

---

## Current UI Layout

```text
┌───────────────┬─┬──────────────────────────┐
│ Timeline      │ │ SourceCodePanel          │
│ (traces/      │▐│ + FlowNavigator          │
│  events)      │▐│                          │
├───────────────┴─┴──────────────────────────┤
│ Bottom header: [Console][Inspector] ... URL/SDK Exit │
├────────────────────────────────────────────┤
│ Bottom body: ConsolePanel or InspectorPanel│
└────────────────────────────────────────────┘
```

No dedicated top status bar in trace mode. Split view default ratio is 55/45 (target/UI), clamped to 20–80%.
