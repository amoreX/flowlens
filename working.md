# How FlowLens Works — The Full Picture

This document explains exactly how FlowLens captures, correlates, and displays every event. It follows the data from the moment the user pastes a URL to the moment a trace appears in the timeline.

---

## 1. App Boot

When the Electron app starts (`src/main/index.ts`), three things happen before the window even opens:

1. **TraceCorrelationEngine** is instantiated — an in-memory store that groups events by `traceId` (max 500 traces, LRU eviction)
2. **Span collector** starts on `http://localhost:9229` — a raw `node:http` server that receives backend span POSTs
3. **WebSocket server** starts on `ws://localhost:9230` — receives events from the injected browser bundle

Then `createMainWindow()` creates the Electron `BrowserWindow` (the right-side React UI), and `registerIpcHandlers()` wires up all the IPC channels that the renderer uses to communicate with the main process.

The renderer loads `App.tsx`, which shows the onboarding page (URL input).

---

## 2. Loading a URL — What Actually Happens

When the user pastes a URL and hits Go:

```
Renderer: window.flowlens.loadTargetUrl(url)
  → IPC invoke: 'target:load-url'
  → Main: createTargetView(url, traceEngine)
```

`createTargetView()` in `target-view.ts` does this:

1. Creates a `WebContentsView` (Electron's embedded browser — like an iframe but at the OS level) with a sandboxed preload script (`target-preload.ts`)
2. Adds it as a child view of the main window, positioned on the left side
3. Sets up the split ratio (default 55% target, 45% UI)
4. Hooks into the `did-finish-load` event — this is the key moment

When the page finishes loading, this line runs:

```ts
targetView.webContents.executeJavaScript(getInstrumentationScript())
```

### What getInstrumentationScript() does

It reads `packages/web/dist/browser.global.js` from disk — this is the IIFE build of the entire `packages/web` source code. It appends an init call:

```js
window.FlowLensWeb.init({
  endpoint: 'ws://localhost:9230',
  patchDOM: true,
  patchFetch: true,
  patchXHR: true,
  patchConsole: true,
  captureErrors: true,
  detectReactState: true
})
```

The entire thing is injected as one big string via `executeJavaScript()`. The browser bundle exposes itself as `window.FlowLensWeb` (the IIFE globalName from `tsup.config.ts`), and `init()` is called immediately after.

The `//# sourceURL=__flowlens_sdk__` at the end tags the script so the stack parser can filter these frames out later.

---

## 3. How the Instrumentation Works (packages/web)

`init()` in `packages/web/src/index.ts` does two things:

1. **Opens a WebSocket connection** to `ws://localhost:9230` (the FlowLens WS server)
2. **Monkey-patches browser APIs** by calling each patch function

Each patch function replaces a global API with a wrapper that captures data, calls `emit()` to send it, then calls the original function. Every patch returns a cleanup function stored in an array, so `destroy()` can restore everything.

### 3.1 The Core Module (core.ts)

This is the heart. It manages:

- **Trace IDs** — a module-level `_currentTraceId` variable. Every `click` or `submit` generates a new one via `newTraceId()`. All other events (network, console, etc.) inherit the current one via `getCurrentTraceId()`. This is how events get grouped into traces.

- **Event emission** — `emit(type, data, traceId?, extraStack?)` creates a `CapturedEvent` object with:
  - A unique `id` (timestamp + random)
  - The `traceId` (either passed or the current one)
  - A `timestamp` (Date.now())
  - A `seq` number (monotonically increasing, for ordering same-millisecond events)
  - `url` (current page URL)
  - `sourceStack` — captured via `new Error().stack` at the moment of emission. This is how FlowLens knows which line of your source code triggered the event. If `extraStack` is provided (e.g., React component stack), it's appended.

The event is then passed to `transportSend()`.

### 3.2 The Transport (transport.ts)

Maintains a persistent WebSocket connection to `ws://localhost:9230`. Features:

- **Auto-reconnect** with exponential backoff (1s → 2s → 4s → ... → 10s max)
- **Offline queue** — if the WebSocket isn't open, events are queued (max 500, oldest dropped)
- **Hello message** — on connect, sends `{ type: 'hello', payload: { userAgent } }` so FlowLens knows a client connected
- **Event messages** — each event is sent as `{ type: 'event', payload: { event } }`

### 3.3 DOM Patch (patches/dom.ts)

Adds capture-phase listeners on `document` for: `click`, `input`, `submit`, `change`, `focus`, `blur`.

When any fires:

1. If `click` or `submit` → `newTraceId()` — starts a new trace
2. Gets the event target element info (tagName, id, className, textContent, value)
3. Calls `getReactComponentStack(el)` to extract React fiber debug info (appended as extra stack frames)
4. Calls `emit('dom', { eventType, target, ... }, traceId, componentStack)`
5. For `click`/`submit`/`change`/`input` → schedules React state detection

### 3.4 Fetch Patch (patches/fetch.ts)

Replaces `window.fetch` with a wrapper:

1. Captures the current `traceId` before the fetch starts
2. **Injects `X-FlowLens-Trace-Id: <traceId>` header** into the request — this is how backend correlation works. The header travels with the HTTP request to your backend.
3. Emits a `network-request` event (method, url, body preview)
4. Calls the original `fetch()`
5. On response: clones the response, reads the body text (up to 2000 chars as `bodyPreview`), emits `network-response`
6. On error: emits `network-error`
7. After response/error: schedules React state detection

### 3.5 XHR Patch (patches/xhr.ts)

Same pattern as fetch but for `XMLHttpRequest`:

- Overrides `XMLHttpRequest.prototype.open` to capture method/url and generate a request ID
- Overrides `XMLHttpRequest.prototype.send` to inject the trace header, emit request event, and listen for load/error
- Stores metadata on the XHR instance as `__fl_*` properties

### 3.6 Console Patch (patches/console.ts)

Replaces `console.log/warn/error/info/debug` with wrappers that:

1. Serialize arguments (JSON.stringify or String() fallback)
2. Emit a `console` event with `{ level, args }`
3. Call the original console method (so your dev tools still work)
4. Schedule React state detection

### 3.7 Error Patch (patches/errors.ts)

Adds `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)`.

Emits `error` events with message, filename, line/col, stack trace, and error type.

### 3.8 React State Detection (react/state-detector.ts)

This is the most complex piece. After every event (DOM, fetch response, console, etc.), `scheduleStateDetection()` is called. It runs at three delays: 0ms, 40ms, and 140ms — because React may batch state updates and re-render asynchronously.

**How it finds React's internal state:**

1. **Finding the fiber root** — React attaches a `__reactFiber$<random>` property to every DOM element it renders. The detector finds this property on the event target (or scans `document.body`'s children), then walks up the fiber tree via `.return` until it reaches the root (the node whose `.stateNode.current` exists).

2. **Walking the fiber tree** — starting from `fiberRoot.current`, recursively walks `.child` and `.sibling` to visit every component in the tree.

3. **Comparing state** — for each function component (where `typeof fiber.type === 'function'`), it walks the hook linked list (`fiber.memoizedState → .next → .next → ...`). Each hook with a `.queue.dispatch` function is a `useState` or `useReducer`. It compares `fiber.memoizedState` (current render) with `fiber.alternate.memoizedState` (previous render).

4. **Deduplication** — uses a `lastKnownValues` map keyed by `componentName:hookIndex`. Only emits if the current serialized value differs from the last known value. This prevents stale re-detections when React's alternate fiber hasn't been reconciled yet.

5. **Source location** — for each detected component, extracts source location from the fiber's `_debugStack` (React 19) or `_debugSource` (React 18) to build stack frames that point to the component's source file.

### 3.9 React Component Stack (react/component-stack.ts)

Called during DOM event handling. Takes the clicked element, finds its `__reactFiber$` property, and walks up the fiber tree (max 15 nodes). For each fiber, extracts `_debugStack` (React 19's V8 error stack from JSX creation) or `_debugSource` (React 18's Babel-annotated file/line). Returns a concatenated stack string that's appended to the DOM event's `sourceStack`.

---

## 4. How Events Flow from Browser to UI

```
Browser page                    Main process                     Renderer (React UI)
─────────────                   ────────────                     ───────────────────
emit() called
  ↓
transport.send()
  ↓ WebSocket
  ↓ ws://localhost:9230
  ↓
ws-server.ts receives message
  ↓ parses JSON
  ↓ validates event fields
  ↓
traceEngine.ingestEvent(event)  ──── groups by traceId ────→  stored in TraceData
  ↓
mainWindow.webContents.send(     ──── IPC push ────────────→  onTraceEvent callback
  'trace:event-received', event)                               in useTraceEvents hook
                                                                ↓
                                                              upsertEvent() adds to
                                                              local trace map
                                                                ↓
                                                              setTraces() triggers
                                                              React re-render
                                                                ↓
                                                              Timeline, SourcePanel,
                                                              Console, Inspector
                                                              all update
```

### 4.1 WebSocket Server (ws-server.ts)

Receives raw WebSocket messages, parses JSON, validates that the event has all required fields (`id`, `traceId`, `type`, `timestamp`, `data`), then:

1. Calls `traceEngine.ingestEvent(event)` to store it
2. Forwards it to the renderer via `mainWindow.webContents.send('trace:event-received', event)`

### 4.2 Trace Correlation Engine (trace-correlation-engine.ts)

The in-memory store. When `ingestEvent()` is called:

- If no trace exists for this `traceId` → creates a new `TraceData` with this event
- If a trace exists → inserts the event in sorted order (by timestamp), updates `startTime`/`endTime`/`rootEvent`

Events within a trace are kept sorted by timestamp via `insertEventSorted()` (binary search insert). The engine caps at 500 traces with LRU eviction (oldest insertion order removed first).

### 4.3 The Renderer Hooks

**useTraceEvents** — the primary data hook. On mount:

1. Subscribes to `onTraceEvent` (live stream) — this must happen first to avoid missing events
2. Loads existing traces via `getAllTraces()` and merges them into the local map
3. On each new event: `upsertEvent()` adds it to the trace map (deduped by event ID), then `setTraces()` triggers a re-render

**useSourceHitMap** — tracks which source files and lines have been "hit" by events:

1. For each event, parses `sourceStack` via `parseAllUserFrames()` to extract file paths + line numbers
2. Builds a per-trace `TraceHitData` map: file → line → hit count
3. Auto-fetches source files via `window.flowlens.fetchSource(filePath)`
4. Provides the data to `SourceCodePanel` for line highlighting

**useConsoleEntries** — extracts `console` and `error` events, formats them into `ConsoleEntry` objects, caps at 2000.

**useInspectorEntries** — extracts `state-change` events (component, hook index, prev/current values) and `network-response` events (method, url, status, body preview).

---

## 5. How Source Code Display Works

When an event has a `sourceStack` like:

```
Error
    at onClick (http://localhost:3099/src/App.tsx:15:5)
    at HTMLButtonElement.handler (http://localhost:3099/src/App.tsx:42:10)
```

### 5.1 Stack Parsing (utils/stack-parser.ts)

`parseAllUserFrames()` splits the stack into lines and matches each against three regex patterns:

- **Chrome V8** — `at func (http://host/path:line:col)`
- **Node.js** — `at func (/absolute/path:line:col)`
- **ESM** — `at func (file:///path:line:col)`

It filters out instrumentation frames by checking the file path against a list: `__flowlens_sdk__`, `@nihal/flowlens-web`, `node_modules`, `.vite/deps`, `node:` internals, browser extensions, etc.

Returns an array of `SourceLocation` objects: `{ filePath, line, column, functionName }`.

### 5.2 Source File Fetching (source-fetcher.ts)

When the renderer needs to display source code, it calls `window.flowlens.fetchSource(fileUrl)` which invokes the main process's `fetchSourceFile()`:

1. **Local path** (`/Users/x/project/server.js`) → reads directly from disk via `fs.readFile`
2. **file:// URL** → strips protocol, reads from disk
3. **HTTP URL** (`http://localhost:3099/src/App.tsx`) → fetches from the dev server

For HTTP URLs, the fetched content is usually transformed/bundled by Vite. The source fetcher extracts the **inline base64 source map** (the `//# sourceMappingURL=data:application/json;base64,...` comment at the end):

1. Decodes the base64 → parses the JSON source map
2. Finds the best matching source file in `sources[]` by comparing path suffixes
3. Returns `sourcesContent[i]` (the original source code)
4. Builds a `lineMap: Record<number, number>` by decoding the VLQ mappings — this maps transformed line numbers (from stack traces) to original source line numbers

The `lineMap` is critical: when a stack trace says "line 42" that's the transformed line in Vite's output. The lineMap translates it to the actual line in your source file.

### 5.3 Source Code Panel (SourceCodePanel.tsx)

Three display modes:

- **Live mode** — shows the most recent trace's hit files. Lines that were hit get colored backgrounds: orange for the latest event's lines, blue for other events in the trace.
- **Focus mode** — activated when you focus a trace (click the ➤ button). Shows the focused event's full call stack with amber highlights for the current event's frames and blue for other events.
- **Inspect mode** — activated by the element inspector. Shows a specific file at a specific line.

Line numbers from stack traces are translated through the `lineMap` before highlighting, so highlights land on the correct original source lines even when Vite transforms the code.

---

## 6. How Backend Correlation Works

The full flow:

```
1. User clicks button in embedded page
2. Click generates new traceId (e.g., "m1abc-xyz1234")
3. Click triggers fetch("http://localhost:3098/api/todos")
4. Fetch patch injects header: X-FlowLens-Trace-Id: m1abc-xyz1234
5. Request arrives at Express server
6. @nihal/flowlens-node middleware reads the header
7. Middleware captures request stack trace + start time
8. Express route handler runs, sends response
9. On 'finish' event, middleware captures response stack trace + duration
10. Middleware POSTs span to http://localhost:9229 (fire-and-forget):
    {
      traceId: "m1abc-xyz1234",
      route: "/api/todos",
      method: "GET",
      statusCode: 200,
      duration: 1800,
      serviceName: "test-back",
      timestamp: 1709901234567,
      requestStack: "Error\n    at ...",
      handlerStack: "Error\n    at ...",
      responseStack: "Error\n    at ..."
    }
11. FlowLens span collector receives the POST
12. Splits one span into 3 backend-span events:
    - phase: "request"  (step: "ingress")   — timestamp = start
    - phase: "handler"  (step: "route-handler") — timestamp = midpoint
    - phase: "response" (step: "egress")    — timestamp = end
    Each gets the corresponding per-phase stack trace.
13. All 3 events are ingested into traceEngine with traceId "m1abc-xyz1234"
14. They appear in the same trace as the click + fetch events
```

The `@nihal/flowlens-node` Express middleware (`packages/node/src/middleware/express.ts`):

1. Checks for the `x-flowlens-trace-id` header on every request
2. If absent → calls `next()` immediately (zero overhead)
3. If present → captures `requestStack` via `new Error().stack`, records start time
4. Listens for the response `finish` event
5. On finish → captures `responseStack`, calculates duration, POSTs span data to the collector via `node:http` (fire-and-forget, 500ms timeout, errors silently swallowed)

The sender (`packages/node/src/sender.ts`) uses raw `node:http.request()` with zero dependencies. It's completely fire-and-forget — if FlowLens isn't running, the POST fails silently and your backend is unaffected.

---

## 7. How the Element Inspector Works

When you click Inspect in the toolbar:

1. Renderer calls `window.flowlens.startInspect()` → IPC → `startInspectMode()` in target-view.ts
2. A self-contained JavaScript script is injected into the embedded page via `executeJavaScript()`. This script:
   - Creates a fixed-position overlay div and tooltip div
   - Adds `mousemove` listener (capture phase, `stopImmediatePropagation` to prevent FlowLens DOM patches from firing)
   - On hover: positions the overlay over the hovered element, shows tooltip with tag/classes/dimensions
   - Walks `__reactFiber$` to find the nearest React function component name and its `_debugStack`/`_debugSource` for source location
   - On click (capture, preventDefault + stopPropagation): cleans up overlay, resolves the injected script's Promise with element info
   - On Escape: cleans up and resolves with `{ cancelled: true }`
3. The `executeJavaScript()` returns a Promise that resolves with the element info
4. If a source file was found, the renderer sets `inspectedSource` state → SourceCodePanel switches to inspect mode and shows that file at the target line

---

## 8. The IPC Bridge

Electron has three process contexts that can't directly share memory:

- **Main process** — Node.js, has access to the filesystem, network, and manages windows
- **Renderer process** — the React UI, runs in a browser-like context
- **Target view** — the embedded page, sandboxed and isolated

Communication between them:

### Renderer ↔ Main (preload/index.ts)

The preload script runs in the renderer's context but has access to `ipcRenderer`. It exposes a `window.flowlens` API via `contextBridge.exposeInMainWorld()`:

- **Invoke channels** (request-response): `loadTargetUrl`, `unloadTarget`, `reloadTarget`, `getAllTraces`, `getTrace`, `clearTraces`, `fetchSource`, `setSplitRatio`, `highlightDomTarget`, `startInspect`, `stopInspect`
- **Subscribe channels** (push from main): `onTraceEvent`, `onTargetLoaded`

### Target View ↔ Main (preload/target-preload.ts)

Exposes `window.__flowlens_bridge.sendEvent()` which calls `ipcRenderer.send('instrumentation:event', event)`. However, the current instrumentation bundle doesn't use this bridge — it communicates via WebSocket instead. The bridge exists as a legacy path.

---

## 9. The Split View

The target view (embedded browser) and the renderer (React UI) are separate Electron views layered on top of each other:

- Target view: positioned from `(0, 38)` to `(width * splitRatio, height)` — the 38px top inset leaves room for the drag region / toolbar
- Renderer: positioned with CSS `margin-left: splitRatio * 100%` and `width: (1 - splitRatio) * 100%`

The resize handle is a thin absolute-positioned div at the boundary. Dragging it updates `splitRatio` in both the renderer (CSS) and the main process (target view bounds via `target:set-split` IPC).

---

## 10. How Events Are Displayed

### Timeline (Timeline.tsx → TraceGroup.tsx → TimelineEvent.tsx)

Traces are rendered as collapsible groups, newest first. Each `TraceGroup` shows:

- The root event type and a timestamp
- Event count badge
- Action buttons: ➤ (focus — navigates source panel) and … (details — opens slide-in panel)
- Collapsed: shows the trace summary. Expanded: shows all events as `TimelineEvent` rows

Each `TimelineEvent` shows an `EventBadge` (colored by type) and a one-line summary of the event data.

### Console Panel (ConsolePanel.tsx)

`useConsoleEntries` extracts `console` and `error` events and formats them. The panel renders them as timestamped log lines, filterable by level (all/log/warn/error/info/debug), capped at 2000 entries.

### Inspector Panel (InspectorPanel.tsx)

Two tabs:

- **State** — shows `state-change` events as `Component hookIndex: prevValue → value` entries. Clicking navigates to the related event in the timeline.
- **Responses** — shows `network-response` events with method, URL, status, duration, and body preview (up to 2000 chars).

### Event Detail Panel (EventDetailPanel.tsx)

A slide-in overlay triggered by clicking the … button on a trace or clicking an event in the timeline. Shows the full JSON event data and a `SourceCodeViewer` with the event's parsed source location highlighted.

---

## 11. Trace ID Lifecycle

The trace ID is what makes everything work. Here's its lifecycle:

1. **Created** — when a `click` or `submit` DOM event fires, `newTraceId()` generates a new ID (`Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)`)
2. **Stored** — as the module-level `_currentTraceId` in `core.ts`
3. **Inherited** — all subsequent events (network requests, console logs, React state changes) call `getCurrentTraceId()` to get the current ID
4. **Injected** — the fetch/XHR patches add it as the `X-FlowLens-Trace-Id` HTTP header on outgoing requests
5. **Read by backend** — `@nihal/flowlens-node` middleware reads the header and includes it in the span POST
6. **Grouped** — `TraceCorrelationEngine.ingestEvent()` uses the `traceId` as the map key, so all events with the same ID end up in the same `TraceData`
7. **Replaced** — the next `click` or `submit` calls `newTraceId()` again, starting a fresh trace

This means: click → fetch → console.log → setState → backend response all share the same trace ID, and FlowLens renders them as one correlated trace.

---

## 12. Build Pipeline

`npm run dev` does:

1. `build:web-sdk` — runs `tsup` in `packages/web/`, producing:
   - `dist/index.mjs` + `dist/index.js` (ESM + CJS — used if someone imports the package)
   - `dist/browser.global.js` (IIFE — this is what gets injected into embedded pages, exposes `window.FlowLensWeb`)
2. `electron-vite dev` — starts the Electron app with hot reload

`npm run build` does the same `build:web-sdk` step, then typechecks, then runs `electron-builder` to produce the distributable app.

The IIFE bundle is ~8KB minified. It's read from disk by `target-view.ts` at runtime and cached in memory after first load.
