# FlowLens — Developer Guide

FlowLens is an Electron desktop app that loads any web page in an embedded browser, automatically instruments it (zero code changes), and captures every UI event, network call, console log, and error into correlated execution traces displayed in a real-time timeline UI.

---

## Directory Structure

```
src/
├── main/                              # Electron main process
│   ├── index.ts                       # App entry — boots engine, registers IPC, creates window
│   ├── window-manager.ts              # Creates the BrowserWindow (React UI lives here)
│   ├── target-view.ts                 # WebContentsView for target site + IIFE injection
│   ├── ipc-handlers.ts                # All IPC invoke handlers
│   ├── trace-correlation-engine.ts    # In-memory trace store (groups events by traceId)
│   └── source-fetcher.ts             # HTTP fetcher + LRU cache for source files
├── preload/
│   ├── index.ts                       # Renderer preload — exposes window.flowlens API
│   ├── index.d.ts                     # Type declarations for window.flowlens
│   └── target-preload.ts             # Target page preload — exposes bridge.sendEvent()
├── renderer/src/
│   ├── main.tsx                       # React root mount
│   ├── App.tsx                        # Top-level router: onboarding ↔ trace mode
│   ├── pages/
│   │   ├── OnboardingPage.tsx         # URL input form
│   │   └── TracePage.tsx              # Main layout — orchestrates all panels + state
│   ├── components/
│   │   ├── Timeline.tsx               # Trace list (renders TraceGroup per trace)
│   │   ├── TraceGroup.tsx             # Collapsible trace with event list
│   │   ├── TimelineEvent.tsx          # Single event row (type badge, summary, offset)
│   │   ├── SourceCodePanel.tsx        # Dual-mode source viewer (live + focus)
│   │   ├── SourceCodeViewer.tsx       # Context viewer used in event detail overlay
│   │   ├── FlowNavigator.tsx          # ← Event N/M → stepping bar
│   │   ├── ConsolePanel.tsx           # Filterable console log viewer
│   │   ├── EventDetailPanel.tsx       # Slide-in JSON detail overlay
│   │   ├── StatusBar.tsx              # Top bar: URL, event count, stop button
│   │   ├── EventBadge.tsx             # Event count badge
│   │   └── UrlInput.tsx               # URL input with validation
│   ├── hooks/
│   │   ├── useTraceEvents.ts          # Accumulates events into traces from IPC stream
│   │   ├── useSourceHitMap.ts         # Tracks per-file/line hit counts + source cache
│   │   └── useConsoleEntries.ts       # Filters console/error events (2000 cap)
│   ├── utils/
│   │   ├── stack-parser.ts            # V8 stack trace parser + instrumentation filter
│   │   └── syntax.ts                  # Simple JS/TS tokenizer for syntax highlighting
│   └── assets/                        # CSS files (tokens, components, pages)
└── shared/
    └── types.ts                       # CapturedEvent, TraceData, EventData unions
```

---

## Architecture: Three Processes

FlowLens runs three Electron processes that communicate via IPC:

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                            │
│  trace-correlation-engine  ·  source-fetcher  ·  IPC hub    │
└──────────┬────────────────────────────────┬─────────────────┘
           │ IPC                            │ IPC
           ▼                                ▼
┌─────────────────────┐        ┌──────────────────────────────┐
│    TARGET VIEW       │        │       RENDERER (React UI)    │
│  (WebContentsView)   │        │       (BrowserWindow)        │
│                      │        │                              │
│  Loads user's URL    │        │  Right 45% of window         │
│  Left 55% of window  │        │  Timeline + Source + Console │
│  Sandboxed           │        │                              │
│  IIFE injected here  │        │  Subscribes to live events   │
└──────────────────────┘        └──────────────────────────────┘
```

- **Main process** — owns the trace engine, handles IPC, manages both views
- **Target view** — sandboxed WebContentsView that loads the user's site; instrumentation IIFE runs here
- **Renderer** — the React UI that displays traces, source code, and console output

---

## Data Flow: End to End

```
1. User enters URL in onboarding page
        ↓
2. App calls window.flowlens.loadTargetUrl(url)
        ↓  IPC invoke 'target:load-url'
3. Main process creates WebContentsView, loads URL
        ↓  did-finish-load
4. IIFE instrumentation injected via executeJavaScript()
        ↓
5. IIFE monkey-patches fetch, XHR, console, DOM events, error handlers
        ↓
6. User interacts with target page (click, fetch, console.log, etc.)
        ↓
7. IIFE captures event + new Error().stack, calls bridge.sendEvent(event)
        ↓  IPC send 'instrumentation:event'
8. Main process receives event
   ├── traceEngine.ingestEvent(event)  →  stores in Map<traceId, TraceData>
   └── forwards to renderer via IPC 'trace:event-received'
        ↓
9. Renderer hooks process event:
   ├── useTraceEvents  →  updates trace list
   ├── useSourceHitMap →  parses stack, accumulates file/line hits, fetches source
   └── useConsoleEntries → extracts console/error entries
        ↓
10. React components re-render: timeline, source panel, console
```

---

## Instrumentation (IIFE)

The instrumentation script is an inline IIFE string in `target-view.ts`, injected into every loaded page via `executeJavaScript()`.

### What gets patched

| Target | Events emitted | Trace ID behavior |
|--------|---------------|-------------------|
| DOM events (click, input, submit, change, focus, blur) | `dom` | click/submit start a **new trace**; others use current |
| `window.fetch` | `network-request`, `network-response`, `network-error` | Uses current trace ID |
| `XMLHttpRequest` (open/send) | `network-request`, `network-response`, `network-error` | Uses current trace ID |
| `console.*` (log, warn, error, info, debug) | `console` | Uses current trace ID |
| `window.onerror` + `unhandledrejection` | `error` | Uses current trace ID |

### How trace IDs work

A click or submit generates a **new trace ID**. All subsequent events (network calls, console logs, errors) that fire as a result of that interaction share the same trace ID — grouping them into one causal trace.

### Stack capture

Every event captures `new Error().stack` at the moment it fires. This V8 stack trace is later parsed in the renderer to identify which file and line in user code triggered the event.

### Event shape

```typescript
{
  id: string           // unique per event
  traceId: string      // groups related events
  type: EventType      // 'dom' | 'network-request' | 'network-response' | ...
  timestamp: number    // Date.now()
  url: string          // page URL
  data: EventData      // type-specific payload
  sourceStack: string  // V8 stack trace
}
```

---

## Trace Correlation Engine

`src/main/trace-correlation-engine.ts` — simple in-memory store.

- **Storage:** `Map<traceId, TraceData>` + insertion order array
- **ingestEvent(event):** creates a new TraceData on first event for a traceId, appends subsequent events, updates endTime
- **Max traces:** 500 (oldest evicted by insertion order)
- **getAllTraces():** returns all traces sorted by startTime descending (newest first)
- **clear():** wipes everything

A `TraceData` looks like:

```typescript
{
  id: string              // same as traceId
  startTime: number       // earliest event timestamp
  endTime: number         // latest event timestamp
  events: CapturedEvent[] // all events in chronological order
  url: string             // page URL
  rootEvent: CapturedEvent // first event (usually the click/submit)
}
```

---

## IPC Channels

### Target → Main (send)

| Channel | Payload | Purpose |
|---------|---------|---------|
| `instrumentation:event` | `CapturedEvent` | Raw event from instrumented page |

### Main → Renderer (send)

| Channel | Payload | Purpose |
|---------|---------|---------|
| `trace:event-received` | `CapturedEvent` | Forward live events to UI |
| `target:loaded` | `string` (url) | Notify renderer that target page loaded |

### Renderer → Main (invoke, request/response)

| Channel | Args | Returns | Purpose |
|---------|------|---------|---------|
| `target:load-url` | `url` | `{ success }` | Create target view and load URL |
| `target:unload` | — | `{ success }` | Destroy target view, clear traces |
| `trace:get-all` | — | `TraceData[]` | Fetch all stored traces |
| `trace:get` | `id` | `TraceData \| null` | Fetch single trace |
| `trace:clear` | — | `{ success }` | Clear all traces |
| `source:fetch` | `fileUrl` | `SourceResponse` | Fetch source file content |

The renderer accesses these through the `window.flowlens` API (exposed by `preload/index.ts` via contextBridge).

---

## Renderer UI

### Layout

```
┌──────────────────────────────────────┐
│  StatusBar  (URL · event count · ■)  │
├────────────────┬─┬───────────────────┤
│                │ │                    │
│   Timeline     │▐│  Source Code      │
│   (traces +    │▐│  Panel            │
│    events)     │▐│  (+ call stack    │
│                │▐│   in focus mode)  │
│   280px default│▐│                   │
│                │▐│  + FlowNavigator  │
├────────────────┴─┴───────────────────┤
│═══════ resize handle ════════════════│
├──────────────────────────────────────┤
│  Console Panel  (filterable, 180px)  │
└──────────────────────────────────────┘
```

- Vertical divider between timeline and source is draggable (min 160px each side)
- Horizontal divider above console is draggable (60–500px)
- Console is collapsible

### Component tree

```
App
├── OnboardingPage        (mode === 'onboarding')
│   └── UrlInput
└── TracePage             (mode === 'trace')
    ├── StatusBar
    ├── Timeline
    │   └── TraceGroup[]
    │       └── TimelineEvent[]
    ├── SourceCodePanel   (live mode or focus mode)
    ├── FlowNavigator     (only when a trace is focused)
    ├── ConsolePanel
    └── EventDetailPanel  (overlay, only when event selected)
```

### Three core hooks

| Hook | Responsibility |
|------|----------------|
| `useTraceEvents` | Subscribes to live event stream, accumulates traces, provides `traces[]` and `eventCount` |
| `useSourceHitMap` | Parses stacks for every event, tracks per-file/line hit counts, auto-fetches source files, provides hit data + source cache |
| `useConsoleEntries` | Extracts console/error events into filterable entries (capped at 2000) |

---

## Source Code Viewing

### How source is fetched

When an event references a file (via its stack trace), the renderer calls `window.flowlens.fetchSource(fileUrl)`. The main process fetches the file over HTTP (e.g., from the Vite dev server at `http://localhost:3099/src/App.tsx`) and returns the content. Results are cached (LRU, max 100 files). Cache clears on page reload or unload.

### Stack parsing

`stack-parser.ts` parses V8 stack traces and filters out non-user frames:

- **Filtered out:** FlowLens instrumentation frames, `node_modules`, `.vite/deps`, browser extensions, devtools, VM scripts
- **`parseUserSourceLocation(stack)`** — returns the first user-code frame (used in detail overlay)
- **`parseAllUserFrames(stack)`** — returns all user-code frames (used for hit map + call stack display)
- **`extractDisplayPath(url)`** — turns `http://localhost:3099/src/App.tsx` into `src/App.tsx`

### Two display modes

**Live mode** (no event focused) — shows real-time hit accumulation:
- As events arrive, their stack frames are parsed and hits accumulate per file/line
- File tabs show all files referenced in the current trace
- Lines are highlighted based on hit data
- Auto-scrolls to the latest hit

**Focus mode** (event selected from timeline) — shows a specific event's call stack:
- Call stack panel lists all user frames from the selected event
- Clicking a frame jumps to that file and line
- Highlights come from all events in the focused trace

### Three-tier line highlighting

Both modes use a 3-tier color system to show hit priority:

| Tier | CSS class | Color | Meaning |
|------|-----------|-------|---------|
| 1 (deepest) | `hit-latest` | cyan 35% | Latest event's primary frame (live) or current frame (focus) |
| 2 (medium) | `hit-current-event` | cyan 18% | Other frames in the current event |
| 3 (dim) | `hit-trace` | cyan 8% | Lines hit by other events in the trace |

Each tier adds a left border and inset box-shadow for visual depth.

---

## Theming

**"Dark Observatory"** — deep navy backgrounds with neon accents.

### Colors (CSS custom properties in `tokens.css`)

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg-primary` | `#0a0e1a` | Main background |
| `--bg-secondary` | `#0f1424` | Panel backgrounds |
| `--cyan` | `#00e5ff` | Primary accent — selection, UI events, highlights |
| `--amber` | `#ffb300` | Network events, duration badges |
| `--magenta` | `#ff4081` | Errors, warnings |
| `--purple` | `#b388ff` | Console, badges |
| `--green` | `#69f0ae` | Success, navigation events |

### Typography

| Variable | Font | Usage |
|----------|------|-------|
| `--font-display` | DM Serif Display | Headings, titles |
| `--font-mono` | JetBrains Mono | Code, data, body text |

---

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev

# Typecheck + build for production
npm run build
```

### Test app

A simple Vite React app for testing FlowLens:

```bash
cd ~/code/test
npm run dev          # starts on http://localhost:3099
```

Load `http://localhost:3099` in FlowLens to test. The test app has buttons for clicks, network requests, console output, and error triggers.

### Tech stack

- **Electron 34** with electron-vite v3 (Vite-based build)
- **React 19** with TypeScript
- **Vanilla CSS** with CSS custom properties (no CSS-in-JS, no Tailwind)
- **Two preload bundles:** `index.ts` (renderer API) + `target-preload.ts` (target bridge)
