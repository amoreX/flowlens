# How FlowLens Works — The Full Picture

This document explains exactly how FlowLens captures, correlates, and displays every event. Written so you can understand every piece even if you're new to this kind of architecture.

---

## Key Terms You'll See Everywhere

Before diving in, here's what the jargon means:

| Term | What it means |
|------|--------------|
| **Electron** | A framework that lets you build desktop apps using web technologies (HTML, CSS, JavaScript). It bundles Chromium (the browser engine behind Chrome) and Node.js together. Your app has a "main process" (Node.js, runs the backend logic) and a "renderer process" (the browser window showing your UI). |
| **IPC** | Inter-Process Communication. Since the main process and renderer process are separate (they can't just call each other's functions), they talk through message channels. Think of it like texting — one side sends a message, the other side receives it. `ipcMain.handle()` listens for messages, `ipcRenderer.invoke()` sends them. |
| **WebSocket (WS)** | A protocol for real-time two-way communication between a client and server. Unlike HTTP (request → response → done), a WebSocket stays open so data can flow continuously in both directions. FlowLens uses this to stream events from the embedded page to the app. |
| **Monkey-patching** | Replacing a built-in function with your own version at runtime. For example, replacing `window.fetch` with a wrapper that logs every network request before calling the real `fetch`. The original function still works — you're just wrapping it. |
| **IIFE** | Immediately Invoked Function Expression — `(function() { ... })()`. A JavaScript pattern that runs code immediately and keeps everything inside its own scope so it doesn't pollute global variables. The instrumentation bundle is built as an IIFE. |
| **Trace** | A group of related events caused by a single user action. When you click a button, that click, the network request it triggers, the console logs, the state changes, and the backend processing all belong to the same trace. They're linked by a shared `traceId`. |
| **Trace ID** | A unique string (like `"m1abc-xyz1234"`) generated on every click/submit. All subsequent events inherit this ID until the next click/submit creates a new one. It's the glue that groups events together. |
| **Stack trace** | When JavaScript creates an `Error`, it records the chain of function calls that led to that point — file names, line numbers, function names. FlowLens captures these to know which line of YOUR code triggered each event. |
| **Source map** | When build tools like Vite transform your code (combining files, minifying, converting JSX to JS), the line numbers change. A source map is a file that says "line 42 in the output = line 15 in the original." FlowLens reads these to show correct line numbers. |
| **Fiber tree** | React's internal data structure that represents your component tree. Every React component has a "fiber node" with properties like `memoizedState` (current state), `type` (the component function), `child`, `sibling`, `return` (parent). FlowLens reads these to detect state changes. |
| **Preload script** | In Electron, a script that runs before the page loads in a browser window. It has access to Node.js APIs (like `ipcRenderer`) but runs in the browser context. It's used as a secure bridge between the two worlds. |
| **LRU** | Least Recently Used — a cache eviction strategy. When the cache is full, the oldest (least recently used) item gets removed to make room. FlowLens uses this to cap traces at 500. |
| **VLQ** | Variable-Length Quantity — the encoding format used inside source maps to store line/column mappings compactly. FlowLens decodes these to build its line number translation table. |
| **`contextBridge`** | Electron's safe way to expose functions from a preload script to a web page. Instead of giving the page full access to Node.js (dangerous), you define exactly which functions are available through `contextBridge.exposeInMainWorld()`. |

---

## 1. App Boot

When the Electron app starts (`src/main/index.ts`), three things happen before the window even opens:

1. **TraceCorrelationEngine** is created — this is an in-memory store (a JavaScript `Map`) that groups events by their `traceId`. It holds up to 500 traces and drops the oldest when full (LRU eviction).

2. **Span collector** starts on `http://localhost:9229` — a plain HTTP server (built with Node.js's built-in `http` module, no Express or anything) that waits for backend span data to arrive via POST requests.

3. **WebSocket server** starts on `ws://localhost:9230` — waits for the injected browser bundle to connect and stream events in real time.

Then `createMainWindow()` creates the Electron `BrowserWindow` — this is the right-side React UI that shows the timeline, source panel, console, etc. The `registerIpcHandlers()` function sets up all the IPC message channels so the React UI can talk to the main process (e.g., "load this URL", "give me all traces", "fetch this source file").

The React UI loads `App.tsx`, which starts in `onboarding` mode — showing the URL input screen.

---

## 2. Loading a URL — What Actually Happens

When you paste a URL and hit Go, here's the chain of events:

```
React UI:  window.flowlens.loadTargetUrl("http://localhost:3099")
    ↓  (this calls ipcRenderer.invoke, which sends a message to the main process)
Main process:  receives 'target:load-url' message
    ↓  (calls createTargetView)
Main process:  creates WebContentsView, loads the URL in it
```

### What is a WebContentsView?

It's Electron's way of embedding a full browser inside your app — like an `<iframe>` in a webpage, but at the operating system level. It's a real Chromium browser instance with its own DOM, JavaScript context, network stack, etc. It's positioned on the left side of the window, and your React UI sits on the right.

### What happens when the page loads?

When the embedded page finishes loading (the `did-finish-load` event fires), FlowLens runs this:

```ts
targetView.webContents.executeJavaScript(getInstrumentationScript())
```

`executeJavaScript()` takes a string of JavaScript code and runs it inside the embedded page — as if you typed it into the browser's DevTools console. The page has no idea this happened.

### What does getInstrumentationScript() return?

It reads the file `packages/web/dist/browser.global.js` from disk. This is the **built instrumentation bundle** — all the code from `packages/web/src/` compiled into a single file by `tsup` (a build tool). It's an IIFE, meaning it runs immediately when injected.

After the bundle code, it appends:

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

The bundle exposes itself as `window.FlowLensWeb` (configured via `globalName` in `tsup.config.ts`), and `init()` kicks everything off.

The comment `//# sourceURL=__flowlens_sdk__` at the end is a browser hint that names the injected script. This name shows up in stack traces, and FlowLens's stack parser uses it to filter out its own frames (so you only see YOUR code in the source panel, not FlowLens internals).

---

## 3. How the Instrumentation Works (packages/web)

`init()` in `packages/web/src/index.ts` does two things:

1. **Opens a WebSocket connection** to `ws://localhost:9230` — this is how events get from the embedded page to FlowLens
2. **Monkey-patches browser APIs** — replaces `fetch`, `console.log`, DOM event handling, etc. with wrapped versions that capture data

Each patch function replaces a browser API, returns a "cleanup" function (to restore the original), and the cleanup functions are stored in an array. When `destroy()` is called, every cleanup runs and the browser goes back to normal.

A guard (`window.__flowlens_instrumented`) prevents double-patching if the script gets injected twice.

### 3.1 The Core Module (core.ts)

This is the heart of the instrumentation. Two key things it manages:

**Trace IDs:**
There's a module-level variable `_currentTraceId`. Every `click` or `submit` event generates a new one (via `newTraceId()`). All other events (network calls, console logs, state changes) just read the current one (via `getCurrentTraceId()`). This is the entire mechanism that groups events into traces — they all share whatever trace ID was active when they happened.

**Event emission:**
`emit(type, data, traceId?, extraStack?)` is called by every patch. It:

- Creates a unique event `id` using timestamp + random characters
- Attaches the `traceId`
- Records `timestamp` (milliseconds since epoch) and `seq` (a counter that increments with every event — used to order events that happen in the same millisecond)
- Captures `sourceStack` by creating `new Error().stack`. This is the trick — JavaScript records the full call chain whenever an Error is created, even if you never throw it. So `new Error().stack` gives us the file paths and line numbers of every function in the call chain at that moment. This is how FlowLens knows which line of your code triggered the event.
- If `extraStack` is provided (e.g., React component debug info), it's appended to the stack
- Passes the complete event object to the transport for sending

### 3.2 The Transport (transport.ts)

Manages the WebSocket connection to FlowLens:

- **Connects** to `ws://localhost:9230`
- **Auto-reconnects** if the connection drops — waits 1 second, then 2, then 4, up to 10 seconds max (this is called exponential backoff)
- **Queues events offline** — if the WebSocket isn't connected yet, events are saved in an array (max 500). When the connection opens, they're all sent immediately (flushed). If the queue is full, the oldest event is dropped.
- **Sends a hello message** on connect — `{ type: 'hello', payload: { userAgent } }` — so FlowLens knows a browser connected
- **Sends events** as JSON — `{ type: 'event', payload: { event } }`

### 3.3 DOM Patch (patches/dom.ts)

Listens for user interactions on the page. Adds "capture phase" event listeners on `document` for: `click`, `input`, `submit`, `change`, `focus`, `blur`.

**What is capture phase?** DOM events travel in two phases: capture (top-down, from document to the target element) then bubble (bottom-up, from target back to document). By listening in capture phase (`addEventListener(type, handler, true)`), FlowLens sees every event before any page code can stop it.

When any of these events fires:

1. If it's a `click` or `submit` → calls `newTraceId()` — this starts a brand new trace
2. Reads info about the element that was clicked/typed into — its tag name, ID, CSS classes, text content, input value
3. Calls `getReactComponentStack(element)` — walks the React fiber tree to find which React component this element belongs to, and gets its source file location. This info is appended to the event's stack trace.
4. Calls `emit('dom', { eventType, target, ... })` to send the event
5. For interactive events (click, submit, change, input) → schedules React state detection to check if any React state changed as a result

### 3.4 Fetch Patch (patches/fetch.ts)

Replaces `window.fetch` with a wrapper. When your code calls `fetch(url, options)`:

1. Reads the current `traceId`
2. **Adds a custom HTTP header** to the request: `X-FlowLens-Trace-Id: <traceId>`. This header travels with the HTTP request to your backend server. This is the entire mechanism for frontend-backend correlation — the backend reads this header and sends its span data back with the same ID.
3. Emits a `network-request` event (method, url, body preview)
4. Calls the real `fetch()` and waits for the response
5. On success: clones the response (because response bodies can only be read once in the Fetch API), reads the body text (up to 2000 characters), emits a `network-response` event with the status, duration, and body preview
6. On failure: emits a `network-error` event
7. After either outcome: schedules React state detection (because a fetch response often triggers a `setState`)

### 3.5 XHR Patch (patches/xhr.ts)

Same idea as the fetch patch, but for `XMLHttpRequest` (the older way to make HTTP requests — some libraries still use it).

- Overrides `XMLHttpRequest.prototype.open` — captures the method and URL, generates a request ID
- Overrides `XMLHttpRequest.prototype.send` — injects the trace header, emits the request event, listens for the `load` (success) and `error` events on the XHR object
- Stores metadata directly on each XHR instance as `__fl_method`, `__fl_url`, `__fl_reqId`, `__fl_traceId` properties

### 3.6 Console Patch (patches/console.ts)

Replaces `console.log`, `console.warn`, `console.error`, `console.info`, and `console.debug` with wrappers that:

1. Convert each argument to a string (using `JSON.stringify` for objects, `String()` as fallback)
2. Emit a `console` event with `{ level: "log", args: ["the", "arguments"] }`
3. Call the **original** console method — so messages still show up in the browser's DevTools console
4. Schedule React state detection

### 3.7 Error Patch (patches/errors.ts)

Adds global error handlers:

- `window.addEventListener('error', handler)` — catches runtime errors (like `TypeError: cannot read property of undefined`)
- `window.addEventListener('unhandledrejection', handler)` — catches Promise rejections that nobody `.catch()`-ed

Emits `error` events with the error message, file name, line number, and stack trace.

### 3.8 React State Detection (react/state-detector.ts)

This is the most complex piece. After every event, `scheduleStateDetection()` runs at three different delays: 0ms, 40ms, and 140ms. Why multiple delays? Because React batches state updates and may not re-render immediately. The 40ms and 140ms delays catch updates that happen asynchronously (e.g., after a `fetch` response triggers `setState`).

**How it finds React's internal state — step by step:**

1. **Finding the fiber root:**
   React attaches a hidden property named `__reactFiber$<randomstring>` to every DOM element it renders. The detector looks for any property starting with `__reactFiber$` on the event's target element. Once found, it follows `.return` pointers up the tree (like following "parent" links) until it reaches the root node (identifiable because `root.stateNode.current` exists). This root represents your entire React app.

2. **Walking the entire component tree:**
   Starting from the root's `.current` fiber, it recursively visits every component by following `.child` (first child) and `.sibling` (next sibling) pointers. This visits every single React component currently rendered.

3. **Checking each component's hooks:**
   For each function component (where `typeof fiber.type === 'function'`), it looks at `fiber.memoizedState`. In React's internals, hooks are stored as a **linked list** — `memoizedState` points to the first hook, `.next` points to the second, `.next.next` to the third, etc.

   Each hook that has a `.queue.dispatch` function is a `useState` or `useReducer` hook. The detector reads `.memoizedState` (the current value) and compares it against `fiber.alternate.memoizedState` (the value from the previous render — React keeps an "alternate" fiber tree for diffing).

4. **Filtering stale detections:**
   Here's the tricky part: React doesn't always update the alternate fiber immediately. So the detector might see a difference between current and alternate that's from a PREVIOUS interaction, not the current one. To fix this, a `lastKnownValues` map tracks the last value we saw for each `componentName:hookIndex`. If the current value matches what we already know, it's stale and gets skipped. Only genuinely new values are emitted.

5. **Getting the source location:**
   For each component with a state change, the detector reads `fiber._debugStack` (React 19 — contains a full V8 stack trace from where the JSX element was created) or `fiber._debugSource` (React 18 — contains just the file name and line number, added by Babel during compilation). This is how the source panel knows which file to show.

### 3.9 React Component Stack (react/component-stack.ts)

Called during DOM event handling (section 3.3). Takes the clicked DOM element, finds its `__reactFiber$` property, and walks UP the fiber tree (via `.return`, max 15 levels). For each fiber it visits, it extracts source location info from `_debugStack` or `_debugSource`, deduplicates the frames, and returns them as a stack string. This gets appended to the DOM event's `sourceStack` so the source panel can show which React component the click happened in.

---

## 4. How Events Flow from Browser to UI

```
Embedded page                  Main process                    React UI (renderer)
──────────────                 ────────────                    ──────────────────
emit() is called
(by any patch)
  ↓
transport.send()
sends JSON over WebSocket
to ws://localhost:9230
  ↓
ws-server.ts receives
the WebSocket message
  ↓ parses JSON
  ↓ validates fields
  ↓
traceEngine.ingestEvent()      groups event by traceId         (stored in a Map)
  ↓
mainWindow.webContents.send()  sends IPC message ───────────→  onTraceEvent callback
  'trace:event-received'                                       fires in useTraceEvents
                                                                ↓
                                                              upsertEvent() adds event
                                                              to local trace map
                                                              (deduped by event.id)
                                                                ↓
                                                              setTraces() triggers
                                                              React re-render
                                                                ↓
                                                              Timeline, SourcePanel,
                                                              Console, Inspector
                                                              all update visually
```

### 4.1 WebSocket Server (ws-server.ts)

A WebSocket server running on port 9230. When a message arrives:

1. Parses the JSON
2. Checks the message type — only processes `type: 'event'` messages
3. Validates the event has required fields: `id`, `traceId`, `type`, `timestamp`, `data`
4. Calls `traceEngine.ingestEvent(event)` to store it in the trace engine
5. Forwards it to the React UI via IPC: `mainWindow.webContents.send('trace:event-received', event)`

### 4.2 Trace Correlation Engine (trace-correlation-engine.ts)

The in-memory database for traces. It's a `Map<string, TraceData>` where the key is the `traceId`.

When `ingestEvent(event)` is called:

- **New trace** (no entry for this `traceId` yet) → creates a `TraceData` object with this event as the only event, sets `startTime`, `endTime`, `url`, and `rootEvent`
- **Existing trace** → inserts the event into the events array in timestamp-sorted order (using `insertEventSorted`, which finds the right position and splices the event in). Updates `startTime` and `endTime` if needed.

The engine caps at 500 traces. When that limit is exceeded, the oldest trace (by insertion order, not by timestamp) is deleted.

### 4.3 The Renderer Hooks

These are React hooks that manage state in the UI. Each one subscribes to the live event stream and processes events for a specific purpose.

**useTraceEvents** — the main data hook:

1. Subscribes to `onTraceEvent` first (so no live events are missed)
2. Then loads any existing traces from the main process via `getAllTraces()`
3. Merges existing traces with any live events that arrived during loading
4. On each new event: checks if we've seen this event ID before (dedup), adds it to the correct trace, re-sorts, and triggers a React re-render

**useSourceHitMap** — tracks which source code lines have been "hit" by events:

1. For every event, parses the `sourceStack` string into structured frames: `{ filePath, line, column, functionName }`
2. Builds a map: `filePath → lineNumber → hitCount` (how many events touched this line)
3. Auto-fetches the source file content via `window.flowlens.fetchSource(filePath)` so the source panel can display the code
4. Tracks which file and line was hit most recently (for auto-scrolling)

**useConsoleEntries** — filters events for `console` and `error` types, formats them as `{ timestamp, level, message }`, caps at 2000 entries.

**useInspectorEntries** — filters for `state-change` events (component name, hook index, prev/current values) and `network-response` events (method, URL, status, body preview).

---

## 5. How Source Code Display Works

When an event has a `sourceStack` like:

```
Error
    at onClick (http://localhost:3099/src/App.tsx:15:5)
    at HTMLButtonElement.handler (http://localhost:3099/src/App.tsx:42:10)
```

FlowLens needs to: (1) parse the file paths and line numbers, (2) fetch the actual source code, and (3) display it with the right lines highlighted.

### 5.1 Stack Parsing (utils/stack-parser.ts)

`parseAllUserFrames()` splits the stack string by newlines and matches each line against regex patterns that recognize V8 stack frame formats:

- **Browser (Chrome):** `at functionName (http://localhost:3099/src/App.tsx:15:5)`
- **Node.js:** `at functionName (/Users/nihal/project/server.js:10:30)`
- **Node.js ESM:** `at functionName (file:///Users/nihal/project/server.js:10:30)`

It then **filters out** any frames that belong to FlowLens itself or third-party code — checking the file path for patterns like `__flowlens_sdk__`, `node_modules`, `.vite/deps`, `node:` (Node.js built-ins), `chrome-extension://`, etc. This is why the source panel only shows YOUR code.

Returns an array of `{ filePath, line, column, functionName }` objects.

### 5.2 Source File Fetching (source-fetcher.ts)

When the React UI needs to display a source file, it calls `window.flowlens.fetchSource(fileUrl)`. This IPC call reaches the main process, which has access to the filesystem and network.

The fetcher resolves files in three ways:

1. **Absolute filesystem path** (like `/Users/nihal/project/server.js`) — reads directly from disk using `fs.readFile`. Used for backend source files.
2. **`file://` URL** (like `file:///Users/nihal/project/server.js`) — strips the `file://` prefix and reads from disk. Used for ESM Node.js stacks.
3. **HTTP URL** (like `http://localhost:3099/src/App.tsx`) — makes an HTTP request to the dev server (Vite) to get the file content.

**The source map challenge:**

For HTTP URLs, the fetched content is usually **transformed** by Vite — JSX is converted to JavaScript, imports are rewritten, etc. The line numbers in the transformed code don't match your original source. But Vite appends an **inline source map** at the bottom of each file — a base64-encoded JSON blob that contains:

- `sources` — list of original file paths
- `sourcesContent` — the actual original source code for each file
- `mappings` — a VLQ-encoded string that maps each line/column in the transformed output to a line/column in the original source

The source fetcher:

1. Finds the `//# sourceMappingURL=data:application/json;base64,...` comment
2. Decodes the base64 → parses the JSON
3. Picks the best matching source file by comparing path suffixes (e.g., `/src/App.tsx` matches `App.tsx`)
4. Returns the original source code from `sourcesContent`
5. Decodes the VLQ `mappings` string to build a `lineMap: { [transformedLine]: originalLine }` — a translation table

The `lineMap` is critical: when a stack trace says "line 42," that's the line in Vite's transformed output. The lineMap converts it to the correct line in your original source file.

Results are cached (up to 100 files, oldest evicted first) so the same file isn't fetched twice.

### 5.3 Source Code Panel (SourceCodePanel.tsx)

Three display modes:

- **Live mode** (default) — as events arrive in real time, shows the most recently hit file. Lines that events touched get colored backgrounds: orange for the most recent event's lines, blue for other events in the same trace. Auto-scrolls to the latest hit line.
- **Focus mode** — activated when you click the focus button (arrow icon) on a trace. Shows the focused event's full call stack with amber highlights for the current event and blue for other events in the trace.
- **Inspect mode** — activated by the element inspector. Shows a specific file at a specific line with that line highlighted.

All line numbers from stack traces are translated through the `lineMap` before highlighting, so highlights land on the correct original source lines.

---

## 6. How Backend Correlation Works

This is the full journey of a trace that spans frontend and backend:

```
Step 1:  You click a button in the embedded page
Step 2:  The DOM patch generates a new traceId: "m1abc-xyz1234"
Step 3:  The click triggers fetch("http://localhost:3098/api/todos")
Step 4:  The fetch patch adds a header to the request:
         X-FlowLens-Trace-Id: m1abc-xyz1234
Step 5:  The HTTP request (with the header) arrives at your Express server
Step 6:  The @nihal/flowlens-node middleware runs before your route handler
         It reads the X-FlowLens-Trace-Id header → finds "m1abc-xyz1234"
Step 7:  Middleware captures a stack trace (new Error().stack) and records
         the start time
Step 8:  Your Express route handler runs, does its work, sends a response
Step 9:  When the response is sent (the 'finish' event on the response
         object), middleware captures another stack trace, calculates
         the total duration (end time - start time)
Step 10: Middleware sends an HTTP POST to http://localhost:9229 with:
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
         This POST is fire-and-forget: if it fails, nothing bad happens.
Step 11: FlowLens's span collector (port 9229) receives this POST
Step 12: It splits the one span into 3 separate events:
         - "request" phase (step: "ingress") — timestamp = start of request
         - "handler" phase (step: "route-handler") — timestamp = midpoint
         - "response" phase (step: "egress") — timestamp = end of request
         Each event gets the corresponding stack trace for that phase.
Step 13: All 3 events are stored in the trace engine under traceId
         "m1abc-xyz1234" — the SAME trace as the click and fetch events
Step 14: They appear in the timeline grouped together with the
         frontend events
```

The middleware (`packages/node/src/middleware/express.ts`) is designed to be invisible when FlowLens isn't being used. It checks for the `x-flowlens-trace-id` header on every request. If the header is absent (normal traffic, production), it calls `next()` immediately — zero overhead, zero side effects.

The sender (`packages/node/src/sender.ts`) uses Node.js's built-in `http.request()` — no dependencies like `axios` or `node-fetch`. The POST has a 500ms timeout, and all errors are silently swallowed. If FlowLens isn't running, your backend doesn't notice.

---

## 7. How the Element Inspector Works

When you click Inspect in the toolbar above the embedded page:

1. The React UI calls `window.flowlens.startInspect()` → IPC message → main process calls `startInspectMode()`

2. `startInspectMode()` injects a JavaScript script into the embedded page via `executeJavaScript()`. This script is completely self-contained (no dependency on the instrumentation bundle). It:

   - Creates two invisible DOM elements: an **overlay** (a cyan-bordered box that covers the hovered element) and a **tooltip** (a dark box showing element info)
   - Adds a `mousemove` listener in capture phase with `stopImmediatePropagation()` — this means it intercepts mouse movements before the FlowLens DOM patch can see them, so hovering during inspect mode doesn't create trace events
   - On hover: calculates the hovered element's position via `getBoundingClientRect()`, moves the overlay to cover it, and fills the tooltip with: tag name, CSS classes, dimensions, React component name (from `__reactFiber$`), and source file location (from `_debugStack` or `_debugSource`)
   - Adds a `click` listener (also capture phase, with `preventDefault` and `stopPropagation`) — when you click an element, it removes the overlay, and resolves the Promise with the element's info
   - Adds a `keydown` listener for Escape — cancels inspect mode and resolves with `{ cancelled: true }`
   - Changes the cursor to crosshair (`document.body.style.cursor = 'crosshair'`)

3. The `executeJavaScript()` call returns a Promise. Electron waits for the injected script's Promise to resolve (when the user clicks or presses Escape), then returns the result to the main process.

4. The main process returns the result via IPC to the React UI.

5. If the result has a `sourceFile`, the React UI sets `inspectedSource` state → `SourceCodePanel` switches to inspect mode and displays that file with the target line highlighted.

---

## 8. The IPC Bridge

Electron runs code in separate processes that can't directly call each other's functions or share variables. Think of them as separate programs that communicate by sending messages.

**Three process contexts:**

- **Main process** — runs Node.js. Has access to the filesystem (`fs.readFile`), network (`http.createServer`), and manages windows. This is where the trace engine, source fetcher, span collector, and WebSocket server live.
- **Renderer process** — runs in a Chromium browser window. This is where the React UI lives. It can't access the filesystem or create servers directly — it has to ask the main process via IPC.
- **Target view** — the embedded page showing the user's app. It's sandboxed (can't access Node.js APIs) and isolated (can't access the renderer's DOM or JavaScript).

**How they communicate:**

The **preload script** (`src/preload/index.ts`) is the bridge between the renderer and the main process. It runs in the renderer's context but has access to Electron's `ipcRenderer`. It uses `contextBridge.exposeInMainWorld('flowlens', api)` to safely expose a `window.flowlens` object with specific methods:

- **Request-response methods** (renderer asks, main answers): `loadTargetUrl()`, `unloadTarget()`, `reloadTarget()`, `getAllTraces()`, `getTrace()`, `clearTraces()`, `fetchSource()`, `setSplitRatio()`, `highlightDomTarget()`, `startInspect()`, `stopInspect()`
- **Event subscriptions** (main pushes to renderer): `onTraceEvent()`, `onTargetLoaded()`

The **target preload** (`src/preload/target-preload.ts`) exposes `window.__flowlens_bridge.sendEvent()` to the embedded page, but the current instrumentation bundle doesn't use this — it communicates via WebSocket instead. The bridge is a legacy leftover.

---

## 9. The Split View

The embedded browser (target view) and the React UI (renderer) are separate Electron views stacked horizontally:

- **Target view** — positioned from coordinates `(0, 38)` to `(width * 0.55, height)`. The 38px top gap leaves room for the toolbar (URL bar, Go, Refresh, Inspect, Exit buttons).
- **React UI** — positioned via CSS: `margin-left: 55%` and `width: 45%`

The resize handle is a thin 5px-wide `<div>` positioned at the boundary. When you drag it:

1. The renderer calculates the new ratio from the mouse position
2. Updates its own CSS (`margin-left` and `width`)
3. Sends `target:set-split` IPC to the main process, which updates the target view's bounds

The ratio is clamped between 20% and 80% so neither side can be hidden completely.

---

## 10. How Events Are Displayed

### Timeline

Traces are rendered as collapsible groups (newest first) by `Timeline.tsx → TraceGroup.tsx → TimelineEvent.tsx`:

- Each `TraceGroup` shows: root event type, timestamp, event count badge, and two action buttons — focus (arrow icon, navigates source panel to this trace) and details (dots icon, opens the event detail overlay)
- When expanded, shows each event as a `TimelineEvent` row with a colored `EventBadge` (blue for DOM, amber for network, red for errors, purple for console, green for backend, cyan for state changes) and a one-line summary

### Console Panel

Renders console and error events as timestamped log lines. Filterable by level (all/log/warn/error/info/debug). Capped at 2000 entries.

### Inspector Panel

Two tabs:
- **State** — shows `state-change` events: `ComponentName hookIndex: "oldValue" → "newValue"`. Clicking navigates to the related event.
- **Responses** — shows `network-response` events: method, URL, status code, duration, and body preview (up to 2000 characters).

### Event Detail Panel

A slide-in overlay showing the full event data as formatted JSON, plus a source code viewer highlighting the event's source location. Triggered by clicking the details button on a trace or clicking an event in the timeline.

---

## 11. Trace ID Lifecycle

The trace ID is the single most important concept. Here's its complete lifecycle:

1. **Created** — when a `click` or `submit` DOM event fires, `newTraceId()` generates a new unique string: `Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)` (e.g., `"m1abc-xyz1234"`)
2. **Stored** — saved as the module-level `_currentTraceId` variable in `core.ts`
3. **Inherited** — when a fetch, console.log, or state change happens, `getCurrentTraceId()` reads the stored value. These events get the same trace ID as the click that started them.
4. **Injected into HTTP requests** — the fetch/XHR patches add it as the `X-FlowLens-Trace-Id` header on every outgoing request
5. **Read by the backend** — `@nihal/flowlens-node` middleware reads the header from incoming requests and includes the same trace ID in the span data it POSTs back
6. **Used as the grouping key** — `TraceCorrelationEngine.ingestEvent()` uses `event.traceId` as the Map key, so all events with the same ID end up in the same `TraceData` object
7. **Replaced** — the next `click` or `submit` calls `newTraceId()`, generating a fresh ID. A new trace begins.

This means: a click, the fetch it triggers, the console.log in the fetch callback, the React state change from the response, and the Express route handler that processed the request — they ALL share the same trace ID and appear as one correlated group in the timeline.

---

## 12. Build Pipeline

**`npm run dev`** does two things:

1. `build:web-sdk` — runs `tsup` (a TypeScript bundler) in `packages/web/`. It produces three outputs:
   - `dist/index.mjs` — ESM (modern JavaScript module format)
   - `dist/index.js` — CJS (CommonJS, the older `require()` format)
   - `dist/browser.global.js` — IIFE (self-executing bundle that creates `window.FlowLensWeb`). This is the ~8KB file that gets injected into embedded pages.

2. `electron-vite dev` — starts the Electron app with hot reload (code changes in the renderer are reflected without restarting)

**`npm run build`** does:

1. Same `build:web-sdk` step
2. `typecheck` — runs TypeScript compiler to verify all types are correct (no runtime effect, just validation)
3. `electron-vite build` — builds the production renderer bundle
4. `electron-builder` — packages everything into a distributable app (.dmg for macOS, .exe for Windows, .AppImage for Linux)

The IIFE bundle (`browser.global.js`) is read from disk by `target-view.ts` at runtime and cached in a variable (`instrumentationScriptCache`) after first read, so it's only loaded from disk once per app session.
