# FlowLens — Developer Guide

This guide reflects the current codebase, including the package-based frontend instrumentation.

## Overview

FlowLens runs in two modes:

- **Embedded mode**: load a URL in a sandboxed `WebContentsView`.
- **SDK mode**: no embedded page; external apps send events via `@flowlens/web` and `@flowlens/node`.

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
    index.ts
    target-preload.ts
  renderer/src/
    App.tsx
    pages/OnboardingPage.tsx
    pages/TracePage.tsx
    components/
    hooks/
    utils/
    assets/
  shared/types.ts
packages/
  web/    (@flowlens/web)
  node/   (@flowlens/node)
```

---

## Architecture

### Main process

- Owns `TraceCorrelationEngine`
- Hosts backend span collector (`:9229`)
- Hosts WS ingestion server (`:9230`)
- Manages embedded target view and split bounds
- Pushes live events to renderer via `trace:event-received`

### Target view (embedded mode)

- Loads user URL in sandboxed `WebContentsView`
- Injects **built bundle** from `packages/web/dist/browser.global.js`
- Calls `window.FlowLensWeb.init({ endpoint: 'ws://localhost:9230', ... })`
- Emits SPA navigation events from `did-navigate-in-page`

### Renderer

- Timeline + source panel + flow navigator + bottom tabs (Console/Inspector)
- Bottom header contains Console/Inspector tabs and right-side URL/Exit
- Uses hooks:
  - `useTraceEvents`
  - `useSourceHitMap`
  - `useConsoleEntries`
  - `useInspectorEntries`

---

## Event Flow

```text
frontend (@flowlens/web) --WS:9230--> ws-server.ts --\
                                                    +--> trace-engine --> renderer
backend (@flowlens/node) ----HTTP:9229--> span-collector --/
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
  - `@flowlens/web browser bundle not found`
- Source parser filters package frames (`@flowlens/web`, `__flowlens_sdk__`) so UI shows user code.

---

## IPC Surface (renderer preload)

Important invoke channels:

- `target:load-url`
- `target:unload`
- `target:set-split`
- `trace:get-all`
- `trace:get`
- `trace:clear`
- `source:fetch`
- `sdk:start-listening`
- `sdk:stop-listening`
- `sdk:get-connection-count`

Push channels:

- `trace:event-received`
- `target:loaded`
- `sdk:connection-count`
- `sdk:connected`
- `sdk:disconnected`

---

## Development Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Current script behavior:

- `npm run dev` builds `@flowlens/web` first (`build:web-sdk`) then runs Electron dev.
- `npm run build` builds `@flowlens/web`, typechecks, then builds Electron app.

---

## Current UI Layout

```text
┌───────────────┬─┬──────────────────────────┐
│ Timeline      │ │ SourceCodePanel          │
│ (traces/events)│ │ + FlowNavigator         │
├───────────────┴─┴──────────────────────────┤
│ Bottom header: [Console][Inspector] ... URL Exit │
├────────────────────────────────────────────┤
│ Bottom body: ConsolePanel or InspectorPanel│
└────────────────────────────────────────────┘
```

No dedicated top status bar in trace mode.
