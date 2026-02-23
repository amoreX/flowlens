# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowLens is a developer-focused debugging and tracing desktop application built with Electron. Users paste a URL, Electron loads it in an embedded browser, an auto-injected IIFE captures every UI event, network call, console log, and error — zero code changes required — and a trace correlation engine groups them into causal execution traces displayed in a real-time timeline UI with source code viewing.

**Current state:** Working MVP. Core instrumentation, trace correlation, split-view UI, source code panel, console, and flow navigation are all implemented. See `readme_dev.md` for a comprehensive developer walkthrough.

## Tech Stack

- **Electron 34** with **electron-vite v3** (Vite 6 based build)
- **React 19**, TypeScript 5.7, vanilla CSS with CSS custom properties
- **uuid** (only runtime dependency)
- **Build:** `npm run dev` (dev with hot reload), `npm run build` (typecheck + production build)

## Architecture

Three Electron processes communicate via IPC:

- **Main process** — owns the trace correlation engine (in-memory, 500 trace LRU), source file fetcher (HTTP + 100-entry LRU cache), IPC handler registry, and manages both views
- **Target view** (WebContentsView, sandboxed) — loads the user's URL in the left portion of the window; IIFE instrumentation injected on page load via `executeJavaScript()`
- **Renderer** (BrowserWindow) — React UI in the right portion; subscribes to live event stream and renders timeline, source code, and console

**Split-view:** Target site on left, React UI on right. Ratio is resizable via drag handle (default 55/45, clamped 20–80%). Controlled by `splitRatio` in `target-view.ts`, updated via `target:set-split` IPC.

**Data flow:** User enters URL → main creates WebContentsView → page loads → IIFE injected → monkey-patches capture events → bridge.sendEvent() via IPC → main ingests into trace engine + forwards to renderer → React hooks update state → UI re-renders

### Instrumentation (IIFE in target-view.ts)

Injected into every loaded page. Monkey-patches:
- **DOM events** (click, input, submit, change, focus, blur) — click/submit start a **new trace ID**; others use current
- **fetch** and **XMLHttpRequest** — request/response/error events
- **console.\*** (log, warn, error, info, debug)
- **window.onerror** + **unhandledrejection**

Every event captures `new Error().stack` for source mapping. The IIFE also walks the React fiber tree (`__reactFiber$`) to extract component source locations — **React 19 primary path** uses `fiber._debugStack` (V8 error stack from element creation), **React 18 fallback** uses `fiber._debugSource` (Babel transform annotations). Collected frames are deduplicated and appended to the event's sourceStack.

### Trace Correlation Engine (trace-correlation-engine.ts)

Groups events by `traceId` into `TraceData` objects. Click/submit events generate new trace IDs; subsequent network/console/error events inherit the current trace ID. Max 500 traces with LRU eviction by insertion order.

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `target:load-url` | renderer → main | Create target view, load URL |
| `target:unload` | renderer → main | Destroy target view, clear traces/cache |
| `target:set-split` | renderer → main | Adjust left/right split ratio |
| `trace:get-all` | renderer → main | Fetch all stored traces |
| `trace:get` | renderer → main | Fetch single trace by ID |
| `trace:clear` | renderer → main | Clear all traces |
| `source:fetch` | renderer → main | Fetch source file content from dev server |
| `instrumentation:event` | target → main | Raw event from instrumented page |
| `trace:event-received` | main → renderer | Forward live event to React UI |
| `target:loaded` | main → renderer | Notify that target page finished loading |

Renderer accesses invoke channels via `window.flowlens` API (exposed by `preload/index.ts` through contextBridge).

## Renderer UI

### Layout

```
┌──────────────────────────────────────┐
│  StatusBar  (URL · event count · ■)  │
├───────────────┬──┬───────────────────┤
│  Timeline     │▐ │  Source Code      │
│  (traces +    │▐ │  Panel            │
│   events)     │▐ │  (live or focus)  │
│  280px default│▐ │  + FlowNavigator  │
├───────────────┴──┴───────────────────┤
│  Console Panel  (filterable, 180px)  │
└──────────────────────────────────────┘
```

All dividers are draggable. Console is collapsible.

### Key Components

- **TracePage** — layout orchestrator, owns selection/focus/resize state
- **Timeline → TraceGroup → TimelineEvent** — trace list with collapse/expand
- **SourceCodePanel** — dual-mode: **live mode** (per-trace hit accumulation, cyan highlights) and **focus mode** (selected event's full call stack, amber highlights via `.hit-nav-*` classes). Each mode uses 3-tier line highlighting for visual depth
- **FlowNavigator** — ← Event N/M → bar for stepping through events in a trace
- **ConsolePanel** — filterable by level (log/warn/error/info/debug), 2000 entry cap
- **EventDetailPanel** — slide-in overlay with JSON event data + source context

### Core Hooks

- **useTraceEvents** — subscribes to `onTraceEvent`, accumulates events into `TraceData[]`
- **useSourceHitMap** — parses `sourceStack` via `parseAllUserFrames()`, tracks per-file/line hit counts per trace (`currentTraceHits` for live mode, `allTraceHits` map for focus mode lookups), auto-fetches source files, provides hit data + source cache
- **useConsoleEntries** — extracts console/error events, filters by level, caps at 2000

### Stack Parsing (utils/stack-parser.ts)

Parses V8 stack traces. Filters out: FlowLens instrumentation frames, `node_modules`, `.vite/deps`, browser extensions, devtools, VM scripts.

- `parseUserSourceLocation(stack)` — first user-code frame (for detail overlay)
- `parseAllUserFrames(stack)` — all user-code frames (for hit map + call stack)
- `extractDisplayPath(url)` — `http://localhost:3099/src/App.tsx` → `src/App.tsx`

## Key File Paths

**Main process:** `src/main/` — index.ts (entry), window-manager.ts, target-view.ts (IIFE + WebContentsView), ipc-handlers.ts, trace-correlation-engine.ts, source-fetcher.ts

**Preloads:** `src/preload/` — index.ts (renderer `window.flowlens` API), target-preload.ts (target `__flowlens_bridge`)

**Renderer:** `src/renderer/src/` — App.tsx (router), pages/TracePage.tsx (main layout), components/, hooks/, utils/

**Shared types:** `src/shared/types.ts` — CapturedEvent, TraceData, EventType, EventData unions, SourceLocation, SourceResponse

## Design Philosophy

"Dark Observatory" theme — deep navy backgrounds (#0a0e1a) with neon accents. Must avoid generic aesthetics.

- **Colors:** cyan (#00e5ff) primary, amber (#ffb300) network, magenta (#ff4081) errors, purple (#b388ff) console, green (#69f0ae) success — each with dim/glow variants. All defined as CSS custom properties in `tokens.css`
- **Typography:** DM Serif Display (headings), JetBrains Mono (body/code) — never Inter, Roboto, Arial
- **CSS:** Vanilla CSS with custom properties. No CSS-in-JS, no Tailwind. Component-scoped CSS files
- **Animations:** CSS keyframes for purposeful transitions (slideIn, fadeUp, pulse). Staggered reveals over scattered micro-interactions
- **Layout:** Atmosphere through gradients, shadows, inset glows — not flat solid backgrounds
