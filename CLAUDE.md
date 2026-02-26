# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowLens is a developer-focused debugging and tracing desktop application built with Electron. Users paste a URL, Electron loads it in an embedded browser, an auto-injected IIFE captures every UI event, network call, console log, and error — zero code changes required — and a trace correlation engine groups them into causal execution traces displayed in a real-time timeline UI with source code viewing.

**Current state:** Working MVP. Core instrumentation, trace correlation, split-view UI, source code panel, console, flow navigation, backend span collection, React state change detection, local source resolution, SDK mode with `@flowlens/web` and `@flowlens/node` packages. See `readme_dev.md` for a comprehensive developer walkthrough and `readme_package.md` for SDK package documentation.

## Tech Stack

- **Electron 34** with **electron-vite v3** (Vite 6 based build)
- **React 19**, TypeScript 5.7, vanilla CSS with CSS custom properties
- **uuid**, **ws** (runtime dependencies)
- **Build:** `npm run dev` (dev with hot reload), `npm run build` (typecheck + production build)
- **SDK packages:** `packages/web` (`@flowlens/web`) and `packages/node` (`@flowlens/node`) — npm workspaces, built with tsup

## Architecture

Three Electron processes communicate via IPC:

- **Main process** — owns the trace correlation engine (in-memory, 500 trace LRU), source file fetcher (filesystem paths + `file://` URLs + HTTP with inline source map extraction, 100-entry LRU cache), span collector (HTTP server on :9229 for backend spans), WebSocket server (:9230 for SDK mode accepting events from `@flowlens/web`), IPC handler registry, and manages both views
- **Target view** (WebContentsView, sandboxed) — loads the user's URL in the left portion of the window; IIFE instrumentation injected on page load via `executeJavaScript()`
- **Renderer** (BrowserWindow) — React UI in the right portion; subscribes to live event stream and renders timeline, source code, and console

**App modes:** `onboarding` (URL input + SDK Mode button), `trace` (embedded browser split view), `sdk-listening` (full-width UI, no target view, live WebSocket connection counter).

**Split-view (trace mode):** Target site on left, React UI on right. Ratio is resizable via drag handle (default 55/45, clamped 20–80%). Controlled by `splitRatio` in `target-view.ts`, updated via `target:set-split` IPC.

**Data flow:** User enters URL → main creates WebContentsView → page loads → IIFE injected → monkey-patches capture events → bridge.sendEvent() via IPC → main ingests into trace engine + forwards to renderer → React hooks update state → UI re-renders

### Instrumentation (IIFE in target-view.ts)

Injected into every loaded page. Monkey-patches:
- **DOM events** (click, input, submit, change, focus, blur) — click/submit start a **new trace ID**; others use current
- **fetch** and **XMLHttpRequest** — request/response/error events; injects `X-FlowLens-Trace-Id` header into all outgoing requests for backend correlation
- **console.\*** (log, warn, error, info, debug)
- **window.onerror** + **unhandledrejection**
- **React state detection** — after **all event types** (DOM events, fetch/XHR response/error, console.*), schedules state checks at multiple delays `[0, 40, 140]ms` to catch async re-renders. Walks the fiber tree comparing `memoizedState` vs `alternate.memoizedState` on useState/useReducer hooks, emitting `state-change` events with component name, hook index, and prev/current values. Deduplicates via `emittedStateSignatures` map to prevent duplicate emissions

Every event captures `new Error().stack` for source mapping (with a per-process `seq` counter for deterministic ordering of same-timestamp events). The IIFE also walks the React fiber tree (`__reactFiber$`) to extract component source locations — `getFiberRootFromElement()` first checks the target element, then falls back to scanning `document.body`'s children. **React 19 primary path** uses `fiber._debugStack` (V8 error stack from element creation), **React 18 fallback** uses `fiber._debugSource` (Babel transform annotations). Collected frames are deduplicated and appended to the event's sourceStack.

### Source Fetcher (source-fetcher.ts)

Resolves source files in this order:
1. **Absolute filesystem path** (`/path/to/file.js`) — reads directly from disk
2. **`file://` URL** (`file:///path/to/file.js`) — strips protocol, reads from disk (ESM Node.js stacks)
3. **HTTP URL** — fetches from dev server, then extracts original source from inline base64 source maps if present (decodes VLQ mappings, matches source by path, returns `lineMap` mapping transformed → original line numbers)

Returns `SourceResponse` which optionally includes `lineMap: Record<number, number>` for source-mapped files.

### Backend Span Collector (span-collector.ts)

HTTP server on port 9229 that receives backend spans via POST. Backends read the `X-FlowLens-Trace-Id` header from incoming requests and POST span data back to FlowLens with the same traceId. Each span is split into **3 events** with phases and step labels: `request` (ingress), `handler` (route-handler), `response` (egress) — timestamps calculated from span duration (start, midpoint, end). Supports **per-phase source stacks** via `phaseStacks: { request, handler, response }` or individual `requestStack`/`handlerStack`/`responseStack` fields (with generic `sourceStack` as fallback for any missing phase). Handler stacks are normalized to strip "at traced" wrapper frames. Also accepts `sourceFile` + `sourceLine` + `sourceColumn` + `sourceFunction` which are synthesized into V8 frames.

### Trace Correlation Engine (trace-correlation-engine.ts)

Groups events by `traceId` into `TraceData` objects. Click/submit events generate new trace IDs; subsequent network/console/error events inherit the current trace ID. Events are inserted in sorted order via `insertEventSorted()` (by timestamp), and `startTime`, `endTime`, `rootEvent`, and `url` are updated on each insert. Max 500 traces with LRU eviction by insertion order.

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `target:load-url` | renderer → main | Create target view, load URL |
| `target:unload` | renderer → main | Destroy target view, clear traces and source cache |
| `target:set-split` | renderer → main | Adjust left/right split ratio |
| `trace:get-all` | renderer → main | Fetch all stored traces |
| `trace:get` | renderer → main | Fetch single trace by ID |
| `trace:clear` | renderer → main | Clear all traces |
| `source:fetch` | renderer → main | Fetch source file (disk for local paths, HTTP + source map extraction for URLs) |
| `instrumentation:event` | target → main | Raw event from instrumented page |
| `trace:event-received` | main → renderer | Forward live event to React UI |
| `target:loaded` | main → renderer | Notify that target page finished loading |
| `sdk:start-listening` | renderer → main | Enter SDK mode (returns `{ success, connectedClients }`) |
| `sdk:stop-listening` | renderer → main | Exit SDK mode (clears traces + source cache) |
| `sdk:get-connection-count` | renderer → main | Get current WebSocket client count |
| `sdk:connection-count` | main → renderer | Live SDK connection count updates |
| `sdk:connected` | main → renderer | New SDK client connected (hello payload) |
| `sdk:disconnected` | main → renderer | Last SDK client disconnected |

Renderer accesses invoke channels via `window.flowlens` API (exposed by `preload/index.ts` through contextBridge).

## Renderer UI

### Layout

```
┌────────────────┬─┬───────────────────┐
│  FlowLensLogo  │ │                   │
│                │ │  Source Code      │
│  Timeline      │▐│  Panel            │
│  (traces +     │▐│  (live or focus)  │
│   events)      │▐│  + FlowNavigator  │
│                │ │                   │
├────────────────┴─┴───────────────────┤
│  ◀ Console │ Inspector │ · URL  Exit │
├──────────────────────────────────────┤
│  Console/Inspector Panel  (180px)    │
└──────────────────────────────────────┘
```

No top status bar — the FlowLensLogo sits in the StatusBar component (top-left), URL/SDK status and Exit button are in the bottom section header (right side). Traces and source panels are window-draggable (`-webkit-app-region: drag`). All dividers are draggable. Console is collapsible.

### Key Components

- **TracePage** — layout orchestrator, owns selection/focus/resize state. Status info (URL/SDK connections/Exit) rendered inline in the bottom section header
- **FlowLensLogo** — animated SVG logo (lens shape + pulsing core + data wave), rendered in the StatusBar
- **StatusBar** — contains FlowLensLogo + green dot + URL or SDK badge + event count + Stop button
- **Timeline → TraceGroup → TimelineEvent** — trace list with collapse/expand. Action buttons: ➤ (focus) and … (details)
- **SourceCodePanel** — dual-mode: **live mode** (per-trace hit accumulation, orange highlights via `.hit-latest`/`.hit-current-event`) and **focus mode** (selected event's full call stack, amber highlights via `.hit-nav-*` classes). Both use blue `.hit-trace` for other events. Each mode uses 3-tier line highlighting for visual depth
- **FlowNavigator** — ← Event N/M → bar for stepping through events in a trace
- **ConsolePanel** — filterable by level (log/warn/error/info/debug), 2000 entry cap
- **EventDetailPanel** — slide-in overlay with JSON event data + source context

### Core Hooks

- **useTraceEvents** — subscribe-first pattern: subscribes to `onTraceEvent` live stream, then loads existing snapshots via `getAllTraces()` and merges them. Uses `upsertEvent()` with dedup by `event.id` and `recomputeTraceMeta()` to re-sort events and recalculate start/end/root on each update
- **useSourceHitMap** — parses `sourceStack` via `parseAllUserFrames()`, tracks per-file/line hit counts per trace (`currentTraceHits` for live mode, `allTraceHits` map for focus mode lookups), auto-fetches source files, provides hit data + source cache
- **useConsoleEntries** — extracts console/error events, filters by level, caps at 2000

### Stack Parsing (utils/stack-parser.ts)

Parses V8 stack traces from browser (HTTP URLs), Node.js (filesystem paths), and ESM (`file://` URLs). Filters out: FlowLens instrumentation frames, `node_modules`, `.vite/deps`, `node:` internals, browser extensions, devtools, VM scripts.

- `parseUserSourceLocation(stack)` — first user-code frame (for detail overlay)
- `parseAllUserFrames(stack)` — all user-code frames (for hit map + call stack)
- `extractDisplayPath(url)` — `http://localhost:3099/src/App.tsx` → `src/App.tsx`; `/Users/x/project/server.js` → `project/server.js`

## Key File Paths

**Main process:** `src/main/` — index.ts (entry), window-manager.ts (with app icon + dock icon), target-view.ts (IIFE + WebContentsView), ipc-handlers.ts, trace-correlation-engine.ts, source-fetcher.ts, span-collector.ts, ws-server.ts (WebSocket server for SDK mode)

**Preloads:** `src/preload/` — index.ts (renderer `window.flowlens` API), target-preload.ts (target `__flowlens_bridge`)

**Renderer:** `src/renderer/src/` — App.tsx (router, 3 modes: onboarding/trace/sdk-listening), pages/TracePage.tsx (main layout), components/ (incl. FlowLensLogo.tsx), hooks/, utils/

**Shared types:** `src/shared/types.ts` — CapturedEvent (with optional `seq` for deterministic ordering), TraceData, EventType, EventData unions (incl. BackendSpanData with phase/step, StateChangeData), SourceLocation, SourceResponse (with optional lineMap)

## Design Philosophy

"Dark Observatory" theme — deep navy backgrounds (#0a0e1a) with neon accents. Must avoid generic aesthetics.

- **Colors:** cyan (#00e5ff) primary, amber (#ffb300) network, magenta (#ff4081) errors, purple (#b388ff) console, green (#69f0ae) success — each with dim/glow variants. All defined as CSS custom properties in `tokens.css`
- **Typography:** DM Serif Display (headings), JetBrains Mono (body/code) — never Inter, Roboto, Arial
- **CSS:** Vanilla CSS with custom properties. No CSS-in-JS, no Tailwind. Component-scoped CSS files
- **Animations:** CSS keyframes for purposeful transitions (slideIn, fadeUp, pulse). Staggered reveals over scattered micro-interactions
- **Layout:** Atmosphere through gradients, shadows, inset glows — not flat solid backgrounds
