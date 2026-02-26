# FlowLens — Developer Guide

FlowLens is an Electron desktop app that loads any web page in an embedded browser, automatically instruments it (zero code changes), and captures every UI event, network call, console log, error, React state change, and backend span into correlated execution traces displayed in a real-time timeline UI.

---

## Directory Structure

```
src/
├── main/                              # Electron main process
│   ├── index.ts                       # App entry — boots engine, registers IPC, starts span collector + WS server
│   ├── window-manager.ts              # Creates BrowserWindow (app icon, dock icon, autoHideMenuBar)
│   ├── target-view.ts                 # WebContentsView for target site + IIFE injection
│   ├── ipc-handlers.ts                # All IPC invoke handlers
│   ├── trace-correlation-engine.ts    # In-memory trace store (groups events by traceId)
│   ├── source-fetcher.ts             # Source resolver (disk / file:// / HTTP + inline source map extraction)
│   ├── span-collector.ts             # HTTP server on :9229 for backend span ingestion
│   └── ws-server.ts                  # WebSocket server on :9230 for SDK mode (@flowlens/web)
├── preload/
│   ├── index.ts                       # Renderer preload — exposes window.flowlens API
│   ├── index.d.ts                     # Type declarations for window.flowlens
│   └── target-preload.ts             # Target page preload — exposes bridge.sendEvent()
├── renderer/src/
│   ├── main.tsx                       # React root mount
│   ├── App.tsx                        # Top-level router: onboarding ↔ trace mode + split-view drag handle
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
│   │   ├── StatusBar.tsx              # FlowLensLogo + status dot + URL/SDK badge + event count + stop
│   │   ├── FlowLensLogo.tsx           # Animated SVG logo (lens + pulsing core + data wave)
│   │   ├── EventBadge.tsx             # Event count badge
│   │   └── UrlInput.tsx               # Inline URL input row (input + → button)
│   ├── hooks/
│   │   ├── useTraceEvents.ts          # Accumulates events into traces from IPC stream
│   │   ├── useSourceHitMap.ts         # Tracks per-file/line hit counts + source cache
│   │   └── useConsoleEntries.ts       # Filters console/error events (2000 cap)
│   ├── utils/
│   │   ├── stack-parser.ts            # V8 stack trace parser (browser + Node.js + file://) + filter
│   │   └── syntax.ts                  # Simple JS/TS tokenizer for syntax highlighting
│   └── assets/                        # CSS files (tokens, components, pages)
└── shared/
    └── types.ts                       # CapturedEvent, TraceData, EventData unions (incl. BackendSpanData, StateChangeData)
```

---

## Architecture: Three Processes

FlowLens runs three Electron processes that communicate via IPC:

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                            │
│  trace-engine · source-fetcher · span-collector · ws-server │
└──────────┬────────────────────────────────┬─────────────────┘
           │ IPC                            │ IPC
           ▼                                ▼
┌─────────────────────┐  ◄─drag─►  ┌──────────────────────────┐
│    TARGET VIEW       │  handle    │    RENDERER (React UI)   │
│  (WebContentsView)   │            │    (BrowserWindow)       │
│                      │            │                          │
│  Loads user's URL    │            │  Timeline + Source +     │
│  Default 55% width   │            │  Console + FlowNav       │
│  Sandboxed           │            │                          │
│  IIFE injected here  │            │  Subscribes to events    │
└──────────────────────┘            └──────────────────────────┘
```

- **Main process** — owns the trace engine, handles IPC, manages both views, runs span collector (HTTP :9229) and WebSocket server (:9230 for SDK mode)
- **Target view** — sandboxed WebContentsView that loads the user's site; instrumentation IIFE runs here
- **Renderer** — the React UI that displays traces, source code, and console output. Three app modes: `onboarding` (URL input), `trace` (embedded browser + split view), `sdk-listening` (full-width UI, no target view)
- **Split boundary** — draggable handle in App.tsx controls the ratio (default 55/45, clamped 20–80%). Renderer updates local state for immediate feedback, then sends ratio to main via `target:set-split` IPC to resize the WebContentsView bounds

---

## Data Flow: End to End

```
1. User enters URL in onboarding page (or clicks "SDK Mode" for external SDK)
        ↓
2. App calls window.flowlens.loadTargetUrl(url)
        ↓  IPC invoke 'target:load-url'
3. Main process creates WebContentsView, loads URL (span collector already running on :9229)
        ↓  did-finish-load
4. IIFE instrumentation injected via executeJavaScript()
        ↓
5. IIFE monkey-patches fetch, XHR, console, DOM events, error handlers
        ↓
6. User interacts with target page (click, fetch, console.log, etc.)
        ↓
7. IIFE captures event + new Error().stack (with seq counter), calls bridge.sendEvent(event)
   ├── Fetch/XHR requests include X-FlowLens-Trace-Id header
   └── After all event types, scheduleStateDetection() checks at [0, 40, 140]ms for React state changes
        ↓  IPC send 'instrumentation:event'
8. Main process receives event (also receives backend spans via HTTP :9229)
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
| DOM events (click, input, submit, change, focus, blur) | `dom` + `state-change` (after re-render) | click/submit start a **new trace**; others use current |
| `window.fetch` | `network-request`, `network-response`/`network-error` + `state-change` | Uses current trace ID; injects `X-FlowLens-Trace-Id` header |
| `XMLHttpRequest` (open/send) | `network-request`, `network-response`/`network-error` + `state-change` | Uses current trace ID; injects `X-FlowLens-Trace-Id` header |
| `console.*` (log, warn, error, info, debug) | `console` + `state-change` | Uses current trace ID |
| `window.onerror` + `unhandledrejection` | `error` | Uses current trace ID |

### How trace IDs work

A click or submit generates a **new trace ID**. All subsequent events (network calls, console logs, errors) that fire as a result of that interaction share the same trace ID — grouping them into one causal trace.

### Stack capture

Every event captures `new Error().stack` at the moment it fires. This V8 stack trace is later parsed in the renderer to identify which file and line in user code triggered the event.

### React component extraction

After capturing the V8 stack, the IIFE walks the React fiber tree (via `__reactFiber$` on DOM elements) to extract component-level source locations. Two paths are supported:

- **React 19** — reads `fiber._debugStack` which contains a full V8 error stack from element creation. Extracts and deduplicates user frames (filters out node_modules, .vite/deps, FlowLens internals, react-stack-top-frame).
- **React 18 fallback** — reads `fiber._debugSource` (Babel transform annotations) and constructs V8-style frame strings from fileName/lineNumber/columnNumber.

Collected frames are appended to the event's `sourceStack`, giving the renderer both the runtime call stack and the React component tree.

### React state change detection

After **all event types** (DOM events, fetch/XHR response/error, console.*), the IIFE calls `scheduleStateDetection()` which fires checks at multiple delays `[0, 40, 140]ms` to catch both synchronous and async React re-renders. Each check walks the fiber tree comparing `fiber.memoizedState` against `fiber.alternate.memoizedState` for every function component with hooks. When a useState/useReducer value has changed (detected via `Object.is`), it emits a `state-change` event with the component name, hook index, previous value, and current value. An `emittedStateSignatures` map prevents duplicate emissions across the multiple delay callbacks.

The fiber root is found via `getFiberRootFromElement()`, which first checks the target element for a `__reactFiber$` key, then falls back to scanning `document.body`'s immediate children.

### Trace header injection

All outgoing fetch and XHR requests have an `X-FlowLens-Trace-Id` header injected automatically. Backend services can read this header to correlate their spans with the frontend trace that initiated the request.

### Event shape

```typescript
{
  id: string           // unique per event
  traceId: string      // groups related events
  type: EventType      // 'dom' | 'network-request' | 'network-response' | 'console'
                       // | 'error' | 'navigation' | 'backend-span' | 'state-change'
  timestamp: number    // Date.now()
  seq?: number         // per-process emission sequence for deterministic same-ms ordering
  url: string          // page URL (or service:method route for backend spans)
  data: EventData      // type-specific payload
  sourceStack: string  // V8 stack trace (browser or Node.js format)
}
```

---

## Trace Correlation Engine

`src/main/trace-correlation-engine.ts` — simple in-memory store.

- **Storage:** `Map<traceId, TraceData>` + insertion order array
- **ingestEvent(event):** creates a new TraceData on first event for a traceId; subsequent events are inserted in sorted order via `insertEventSorted()` (by timestamp using `compareEvents()`). On each insert, updates `startTime` (min), `endTime` (max), `rootEvent` (earliest event), and `url` (from first event that has one)
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

## Backend Span Collector

`src/main/span-collector.ts` — HTTP server started on app boot.

- Listens on port **9229** for POST requests containing backend span data
- CORS enabled so any backend can POST spans
- The `traceId` should match the `X-FlowLens-Trace-Id` header injected into the originating fetch/XHR request
- Each span is split into **3 `backend-span` events** with phases and step labels:
  - `request` (step: `ingress`) — timestamp = start of span
  - `handler` (step: `route-handler`) — timestamp = midpoint of span
  - `response` (step: `egress`) — timestamp = end of span
- Supports **per-phase source stacks** — each phase can have its own source stack:
  - `phaseStacks: { request, handler, response }` — object with per-phase V8 stacks
  - `requestStack` / `handlerStack` / `responseStack` — individual fields (fallback)
  - Generic `sourceStack` or `stack` used as fallback for any missing phase
  - `sourceFile` + `sourceLine` + `sourceColumn` + `sourceFunction` — synthesized into a V8 frame
  - Handler stacks are run through `normalizeHandlerStack()` which strips "at traced" wrapper frames
- `BackendSpanData` includes: `route`, `method`, `statusCode`, `duration`, `serviceName`, `phase`, `step`, and optional `sourceStack`
- Validates `traceId` (returns 400 if missing)
- Gracefully handles port-in-use (logs warning, collector disabled)

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
| `sdk:connection-count` | `number` | Live SDK WebSocket client count |
| `sdk:connected` | `{ userAgent }` | New SDK client connected |
| `sdk:disconnected` | `null` | Last SDK client disconnected |

### Renderer → Main (invoke, request/response)

| Channel | Args | Returns | Purpose |
|---------|------|---------|---------|
| `target:load-url` | `url` | `{ success }` | Create target view and load URL |
| `target:unload` | — | `{ success }` | Destroy target view, clear traces and source cache |
| `target:set-split` | `ratio` (0.2–0.8) | `{ success }` | Adjust target/renderer split ratio |
| `trace:get-all` | — | `TraceData[]` | Fetch all stored traces |
| `trace:get` | `id` | `TraceData \| null` | Fetch single trace |
| `trace:clear` | — | `{ success }` | Clear all traces |
| `source:fetch` | `fileUrl` | `SourceResponse` | Fetch source (disk for local paths, HTTP + source map for URLs) |
| `sdk:start-listening` | — | `{ success, connectedClients }` | Enter SDK mode |
| `sdk:stop-listening` | — | `{ success }` | Exit SDK mode (clears traces + source cache) |
| `sdk:get-connection-count` | — | `number` | Get current SDK WebSocket client count |

The renderer accesses these through the `window.flowlens` API (exposed by `preload/index.ts` via contextBridge).

---

## Renderer UI

### Layout

```
┌────────────────┬─┬───────────────────┐
│  [logo] TRACES │ │                   │
│                │ │  Source Code      │
│  Timeline      │▐│  Panel            │
│  (traces +     │▐│  (+ call stack    │
│   events)      │▐│   in focus mode)  │
│                │▐│                   │
│                │▐│  + FlowNavigator  │
├────────────────┴─┴───────────────────┤
│ ◀ Console │ Inspector │  · URL  Exit │
├══════════ resize handle ═════════════┤
│  Console/Inspector Panel  (180px)    │
└──────────────────────────────────────┘
```

No dedicated top status bar. The FlowLensLogo sits in the StatusBar component. URL (or "SDK — N connected" in SDK mode) and an Exit button are shown on the right side of the bottom section header, alongside the Console/Inspector tab buttons. Both the traces column and source panel are window-draggable (`-webkit-app-region: drag`).

- Vertical divider between timeline and source is draggable (min 160px each side)
- Horizontal divider above console is draggable (60–500px)
- Console is collapsible

### Component tree

```
App (split-view drag handle between target and renderer)
├── OnboardingPage        (mode === 'onboarding')
│   ├── UrlInput          (inline row: input + → button)
│   └── SDK Mode button   (enters 'sdk-listening' mode)
└── TracePage             (mode === 'trace' or 'sdk-listening')
    ├── Timeline
    │   └── TraceGroup[]          (labels: click/submit/navigation/Backend Span/State Update)
    │       └── TimelineEvent[]   (badges: UI/REQ/RES/LOG/ERR/NAV/SVC/SET)
    ├── SourceCodePanel   (live mode or focus mode)
    ├── FlowNavigator     (only when a trace is focused)
    ├── Bottom section header     (◀ Console | Inspector tabs + URL/SDK + Exit on right)
    ├── ConsolePanel / InspectorPanel
    └── EventDetailPanel  (overlay — custom views for backend-span + state-change)
```

**FlowLensLogo** is an animated SVG component (lens shape + pulsing core + data wave line) rendered in the StatusBar. The StatusBar itself sits at the top-left of the traces column.

### Three core hooks

| Hook | Responsibility |
|------|----------------|
| `useTraceEvents` | Subscribe-first: subscribes to live events, then loads snapshots via `getAllTraces()` and merges via `mergeTraceSnapshot()`. Uses `upsertEvent()` (dedup by `event.id`) + `recomputeTraceMeta()` (re-sort, recalculate start/end/root). Provides `traces[]` and `eventCount` |
| `useSourceHitMap` | Parses stacks for every event, tracks per-file/line hit counts (`currentTraceHits` for live, `allTraceHits` for focus), auto-fetches source files, exposes `fetchSourceIfNeeded` for on-demand fetching |
| `useConsoleEntries` | Extracts console/error events into filterable entries (capped at 2000) |

---

## Source Code Viewing

### How source is fetched

When an event references a file (via its stack trace), the renderer calls `window.flowlens.fetchSource(fileUrl)`. The source fetcher (`source-fetcher.ts`) resolves files in this order:

1. **Absolute filesystem path** (starts with `/`) — reads directly from disk (backend Node.js stacks)
2. **`file://` URL** (ESM Node.js stacks) — strips protocol, reads from disk
3. **HTTP URL** — fetches from the dev server, then checks for an inline base64 source map (`//# sourceMappingURL=data:...`). If found, decodes the VLQ mappings, extracts the original source from `sourcesContent`, and returns it along with a `lineMap` (mapping transformed line numbers → original line numbers). If no source map, returns the raw content as-is.

The `SourceResponse` type includes an optional `lineMap?: Record<number, number>` field, which is also stored in `SourceFileCache` by `useSourceHitMap`.

Results are cached (LRU, max 100 files). Cache clears on page reload or unload.

### Stack parsing

`stack-parser.ts` parses V8 stack traces in three formats: browser HTTP URLs, Node.js filesystem paths (`/path/to/file.js:10:30`), and ESM `file://` URLs (`file:///path/to/file.js:10:30`). Uses `matchFrame()` which tries `CHROME_FRAME_RE` → `NODE_FRAME_RE` → `FILE_FRAME_RE`. Filters out non-user frames:

- **Filtered out:** FlowLens instrumentation frames, `node_modules`, `.vite/deps`, `node:` internals, browser extensions, devtools, VM scripts
- **`parseUserSourceLocation(stack)`** — returns the first user-code frame (used in detail overlay)
- **`parseAllUserFrames(stack)`** — returns all user-code frames (used for hit map + call stack display)
- **`extractDisplayPath(url)`** — `http://localhost:3099/src/App.tsx` → `src/App.tsx`; `/Users/x/project/server.js` → `project/server.js`; `file:///Users/x/project/server.js` → `project/server.js`

### Two display modes

**Live mode** (no event focused) — shows real-time hit accumulation:
- As events arrive, their stack frames are parsed and hits accumulate per file/line
- `useSourceHitMap` provides `currentTraceHits` (most recent trace with source hits)
- File tabs show all files referenced in the current trace
- Lines highlighted in **orange** tones based on hit data
- Auto-scrolls to the latest hit

**Focus mode** (event selected from timeline) — shows a specific event's call stack:
- `computeTraceHighlights()` aggregates all events in the focused trace, marking `isCurrentEvent` and `isLatest` flags
- Call stack panel lists all user frames from the selected event (clickable to jump)
- `useSourceHitMap` provides `allTraceHits` map for per-trace lookups
- Lines highlighted in **amber** tones to visually distinguish from live mode

### Three-tier line highlighting

Each mode uses its own color scheme with 3 tiers of intensity:

**Live mode (orange):**

| Tier | CSS class | Color | Meaning |
|------|-----------|-------|---------|
| 1 (deepest) | `hit-latest` | orange 18% | Latest event's primary frame |
| 2 (medium) | `hit-current-event` | orange 10% | Other frames in the current event |
| 3 (dim) | `hit-trace` | blue 10% | Lines hit by other events in the trace |

**Focus mode (amber):**

| Tier | CSS class | Color | Meaning |
|------|-----------|-------|---------|
| 1 (deepest) | `hit-nav-latest` | amber 18% | Current frame being inspected |
| 2 (medium) | `hit-nav-current` | amber 10% | Other frames in the focused event |
| 3 (dim) | `hit-trace` | blue 10% | Lines hit by other events in the trace |

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

### Backend span collector

FlowLens starts an HTTP collector on port 9229 at app boot. To send backend spans:

```bash
curl -X POST http://localhost:9229 \
  -H 'Content-Type: application/json' \
  -d '{"traceId":"<from X-FlowLens-Trace-Id header>","route":"/api/data","method":"GET","statusCode":200,"duration":42,"serviceName":"my-api","timestamp":1234567890,"sourceFile":"/path/to/handler.js","sourceLine":15}'
```

Each span is split into 3 events (request/handler/response phases) that appear in the timeline alongside frontend events from the same trace. Source stack can be provided as `sourceStack` (V8 string), `stack` (alias), or `sourceFile` + `sourceLine`.

### Tech stack

- **Electron 34** with electron-vite v3 (Vite-based build)
- **React 19** with TypeScript
- **Vanilla CSS** with CSS custom properties (no CSS-in-JS, no Tailwind)
- **Two preload bundles:** `index.ts` (renderer API) + `target-preload.ts` (target bridge)
