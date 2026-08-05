# FlowLens — Developer Guide

This guide reflects the current codebase architecture.

## Overview

Users paste a URL and FlowLens loads it in a sandboxed `WebContentsView`, auto-injecting instrumentation. For backend correlation, users install `@nihal/flowlens-node` middleware, which reads the `X-FlowLens-Trace-Id` header and reports spans.

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
  web/    (internal instrumentation bundle, private)
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

### Target view

- Loads user URL in sandboxed `WebContentsView`
- Injects **built bundle** from `packages/web/dist/browser.global.js`
- Calls `window.FlowLensWeb.init({ endpoint: 'ws://localhost:9230', ... })`
- Emits SPA navigation events from `did-navigate-in-page`
- Supports DOM element highlighting via `target:highlight-dom` IPC
- **Element inspector** via `target:inspect-start` — injects a self-contained overlay script that shows element info on hover (tag, classes, dimensions, React component name + source) and returns the selected element's component source location on click

### Renderer

- Timeline + source panel + flow navigator + bottom tabs (Console/Inspector)
- Uses hooks:
  - `useTraceEvents` — subscribe-first live stream + snapshot merge, dedup by event.id
  - `useSourceHitMap` — per-file/line hit tracking, source cache, auto-fetch
  - `useConsoleEntries` — console/error event filtering (2000 entry cap)
  - `useInspectorEntries` — state changes + network responses for inspector tab

### App modes

`App.tsx` manages two modes:

| Mode | Page component | Description |
|------|---------------|-------------|
| `onboarding` | `OnboardingPage` | URL input |
| `trace` | `TracePage` | Split view — embedded site left, tracing UI right |

---

## Event Flow

```text
embedded page (injected bundle) --WS:9230--> ws-server.ts --\
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

`target-view.ts` injects the built bundle from `packages/web/dist/browser.global.js` and initializes `FlowLensWeb`.

For safety:

- If bundle is missing, target view logs a warning
- Source parser filters instrumentation frames (`@nihal/flowlens-web`, `@nihal/flowlens-node`, `flowlens/packages/*`, `flowlens-web/dist`, `flowlens-node/dist`, `__flowlens_sdk__`, `__flowlens_instrumentation__`) so UI shows user code only.

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
| `target:inspect-start` | `startInspect()` | Start element inspector (returns element info on click) |
| `target:inspect-stop` | `stopInspect()` | Cancel element inspector |
| `trace:get-all` | `getAllTraces()` | Fetch all stored traces |
| `trace:get` | `getTrace(id)` | Fetch single trace by ID |
| `trace:clear` | `clearTraces()` | Clear all traces |
| `source:fetch` | `fetchSource(fileUrl)` | Fetch source file (disk/HTTP + source map extraction) |

### Subscribe channels (main → renderer push)

| Channel | API method | Purpose |
|---------|-----------|---------|
| `trace:event-received` | `onTraceEvent(cb)` | Live event stream |
| `target:loaded` | `onTargetLoaded(cb)` | Target page finished loading |

---

## Development Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Current script behavior:

- `npm run dev` builds the instrumentation bundle first (`build:web-sdk`) then runs Electron dev.
- `npm run build` builds the bundle, typechecks, then builds Electron app.

---

## Current UI Layout

```text
┌───────────────┬─┬──────────────────────────┐
│ Timeline      │ │ SourceCodePanel          │
│ (traces/      │▐│ + FlowNavigator          │
│  events)      │▐│                          │
├───────────────┴─┴──────────────────────────┤
│ Bottom header: [Console][Inspector]        │
├────────────────────────────────────────────┤
│ Bottom body: ConsolePanel or InspectorPanel│
└────────────────────────────────────────────┘
```

URL and Exit controls are in the target toolbar above the embedded page. Split view default ratio is 55/45 (target/UI), clamped to 20–80%.
