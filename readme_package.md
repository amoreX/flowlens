# FlowLens SDK Packages

The `packages/` directory contains two npm packages that let any web app and its backend send traces to the FlowLens desktop app — without the embedded browser.

FlowLens has two modes of operation. In **embedded mode**, you paste a URL and FlowLens loads it in a WebContentsView with auto-injected instrumentation. In **SDK mode**, you install `@flowlens/web` and `@flowlens/node` into your own app and they stream events directly to FlowLens over WebSocket and HTTP.

```
packages/
├── web/     @flowlens/web   — browser instrumentation SDK (zero dependencies)
└── node/    @flowlens/node  — backend span collection SDK (zero dependencies)
```

Managed as npm workspaces from the root `package.json`:

```json
"workspaces": ["packages/*"]
```

---

## Architecture

FlowLens starts two servers on boot (in `src/main/index.ts`):

```typescript
startSpanCollector(traceEngine)   // HTTP on :9229
startWsServer(traceEngine)       // WebSocket on :9230
```

| Server | Port | Protocol | Accepts from | Code |
|--------|------|----------|-------------|------|
| Span collector | **9229** | HTTP POST | `@flowlens/node` | `src/main/span-collector.ts` |
| WebSocket server | **9230** | WebSocket | `@flowlens/web` | `src/main/ws-server.ts` |

Both feed events into the same `TraceCorrelationEngine` and forward them to the renderer via `trace:event-received` IPC. The UI cannot tell whether an event came from the built-in IIFE or the SDK.

```
┌──────────────────────────┐     ┌───────────────────────────┐
│  Your Browser App        │     │  Your Backend Server      │
│                          │     │                           │
│  import { init }         │     │  import { flowlens }      │
│    from '@flowlens/web'  │     │    from '@flowlens/node'  │
│                          │     │                           │
│  init()                  │     │  app.use(flowlens({       │
│    ↓ patches DOM, fetch, │     │    serviceName: 'my-api'  │
│      XHR, console, errors│     │  }))                      │
│    ↓ walks React fiber   │     │                           │
│    ↓ detects state       │     │  reads X-FlowLens-Trace-Id│
│      changes             │     │  header from requests     │
│                          │     │                           │
│  ── WebSocket ──────────────┐  │  ── HTTP POST ─────────┐  │
│  ws://localhost:9230     │  │  │  http://localhost:9229  │  │
└──────────────────────────┘  │  └────────────────────────│──┘
                              │                           │
          ┌───────────────────┴───────────────────────────┴──┐
          │               FlowLens Desktop App               │
          │                                                  │
          │  ws-server.ts ──┐    span-collector.ts ──┐       │
          │                 ▼                        ▼       │
          │           TraceCorrelationEngine                  │
          │                 │                                 │
          │                 ▼ IPC: trace:event-received       │
          │           Renderer UI (timeline, source, console) │
          └──────────────────────────────────────────────────┘
```

### Trace ID propagation

```
User clicks button
    ↓
@flowlens/web generates new traceId (uid())
    ↓
Click handler calls fetch('/api/data')
    ↓
@flowlens/web injects X-FlowLens-Trace-Id header into the request
    ↓
Backend receives request with header
    ↓
@flowlens/node middleware reads the traceId from header
    ↓
On response finish, middleware POSTs span to :9229 with same traceId
    ↓
FlowLens correlates: click → network-request → backend-span → network-response → state-change
All in one trace.
```

---

## SDK Mode in the UI

The FlowLens app has three modes defined in `App.tsx`:

```typescript
type AppMode = 'onboarding' | 'trace' | 'sdk-listening'
```

- **`onboarding`** — URL input form + "SDK Mode" button
- **`trace`** — embedded browser on the left, debugging UI on the right (split view)
- **`sdk-listening`** — **no embedded browser**, debugging UI takes the full window width

The onboarding page shows the SDK Mode button:

```tsx
<button className="sdk-mode-btn no-drag" onClick={onSdkMode}>
  SDK Mode
  <span className="sdk-mode-btn-sub">Connect your app via @flowlens/web</span>
</button>
```

When entered, the StatusBar shows a connection badge instead of a URL:

```tsx
{sdkMode ? (
  <>
    <span className="status-sdk-badge">SDK Mode</span>
    <span className="status-sdk-connections">
      {sdkConnections || 0} {sdkConnections === 1 ? 'app' : 'apps'} connected
    </span>
  </>
) : (
  <span className="status-url" title={url}>{url}</span>
)}
```

### SDK IPC channels

The WebSocket server (`ws-server.ts`) notifies the renderer of connection changes:

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `sdk:start-listening` | renderer → main | — | Enter SDK mode (returns `{ success, connectedClients }`) |
| `sdk:stop-listening` | renderer → main | — | Exit SDK mode (clears traces + source cache) |
| `sdk:get-connection-count` | renderer → main | — | Get current WebSocket client count |
| `sdk:connection-count` | main → renderer | `number` | Live connection count updates |
| `sdk:connected` | main → renderer | `{ userAgent }` | New client connected (hello payload) |
| `sdk:disconnected` | main → renderer | `null` | Last client disconnected |

The preload exposes these to the renderer via `window.flowlens`:

```typescript
startSdkMode(): Promise<{ success: boolean; connectedClients: number }>
stopSdkMode(): Promise<{ success: boolean }>
getSdkConnectionCount(): Promise<number>
onSdkConnectionCount(callback: (count: number) => void): () => void
```

---

## `@flowlens/web` — Frontend SDK

Monkey-patches the browser runtime to capture events and stream them to FlowLens via WebSocket. Mirrors the same instrumentation that the built-in IIFE provides, but runs inside your own app as an npm import.

### Install

```bash
npm install @flowlens/web
```

Zero dependencies. The package only uses browser built-ins.

### API

```typescript
import { init, destroy, isActive } from '@flowlens/web'

// Start instrumentation (typically in dev only)
if (import.meta.env.DEV) {
  init()
}

// Later, to tear down all patches and close WebSocket:
destroy()

// Check if currently active:
isActive() // true | false
```

### Double-instrumentation prevention

`init()` checks `window.__flowlens_instrumented` before patching. This flag is also set by the built-in IIFE (in `target-view.ts`):

```javascript
// Built-in IIFE:
if (window.__flowlens_instrumented) return;
window.__flowlens_instrumented = true;

// @flowlens/web init():
if (active || window.__flowlens_instrumented) return
```

If the page is loaded inside FlowLens's embedded browser (where the IIFE already ran), `init()` becomes a no-op. No duplicate events.

### Configuration

```typescript
interface FlowLensWebConfig {
  endpoint?: string          // default: 'ws://localhost:9230'
  enabled?: boolean          // default: true
  patchDOM?: boolean         // default: true
  patchFetch?: boolean       // default: true
  patchXHR?: boolean         // default: true
  patchConsole?: boolean     // default: true
  captureErrors?: boolean    // default: true
  detectReactState?: boolean // default: true
}
```

All options default to `true`. Pass `enabled: false` to disable entirely. Pass individual `patch*: false` to disable specific patches.

### What gets patched

| Target | Events emitted | Trace ID behavior |
|--------|---------------|-------------------|
| DOM events (`click`, `input`, `submit`, `change`, `focus`, `blur`) | `dom` + `state-change` | click/submit start a **new trace**; others use current |
| `window.fetch` | `network-request`, `network-response` / `network-error` + `state-change` | Uses current trace; injects `X-FlowLens-Trace-Id` header |
| `XMLHttpRequest` | `network-request`, `network-response` / `network-error` + `state-change` | Uses current trace; injects `X-FlowLens-Trace-Id` header |
| `console.*` (`log`, `warn`, `error`, `info`, `debug`) | `console` + `state-change` | Uses current trace |
| `window.onerror` + `unhandledrejection` | `error` | Uses current trace |

State detection runs after every event type except errors.

### How traces work

`core.ts` manages the current trace ID:

```typescript
let _currentTraceId = uid()   // initialized on load
let _eventSeq = 0

export function newTraceId(): string {
  _currentTraceId = uid()     // called on click/submit
  return _currentTraceId
}

export function emit(type, data, traceId?, extraStack?): void {
  const event: CapturedEvent = {
    id: uid(),
    traceId: traceId || _currentTraceId,
    type,
    timestamp: Date.now(),
    seq: ++_eventSeq,
    url: location.href,
    data,
    sourceStack: new Error().stack   // + extraStack if provided
  }
  transportSend(event)
}
```

A click generates a new trace ID. The subsequent fetch call, its response, console logs, and state changes all reuse that trace ID until the next click/submit.

### Trace header injection

The fetch patch injects the trace header into all outgoing requests:

```typescript
// From patches/fetch.ts
if (init.headers instanceof Headers) {
  init.headers.set('X-FlowLens-Trace-Id', traceId)
} else if (Array.isArray(init.headers)) {
  init.headers.push(['X-FlowLens-Trace-Id', traceId])
} else {
  init.headers['X-FlowLens-Trace-Id'] = traceId
}
```

The XHR patch does the same via `xhr.setRequestHeader('X-FlowLens-Trace-Id', traceId)`.

### WebSocket transport

`transport.ts` manages the WebSocket connection to FlowLens:

```
connect(endpoint)
    ↓
WebSocket opens → send hello message → flush queued events
    ↓
On each emit() → send({ type: 'event', payload: { event } })
    ↓
If disconnected → queue events (max 500, drop oldest)
    ↓
Auto-reconnect: 1s → 2s → 4s → 8s → 10s (max)
    ↓
destroy() → close WebSocket, stop reconnects, clear queue
```

Message formats:

```json
// Hello (sent on connect)
{ "type": "hello", "payload": { "userAgent": "Mozilla/5.0 ..." } }

// Event (sent per captured event)
{ "type": "event", "payload": { "event": { "id": "...", "traceId": "...", ... } } }
```

The WS server (`ws-server.ts`) receives these, calls `traceEngine.ingestEvent(event)`, and forwards to the renderer.

### React component stack extraction

When a DOM event fires, `getReactComponentStack(element)` walks the React fiber tree via `__reactFiber$` on the target element:

- **React 19**: reads `fiber._debugStack.stack` (V8 error stack from JSX element creation)
- **React 18**: reads `fiber._debugSource` (Babel transform annotations with `fileName`/`lineNumber`) and constructs V8-style frame strings

Walks up to 15 fibers via `fiber.return`. Frames are deduplicated and filtered (no `node_modules`, `.vite/deps`, `__flowlens`, `react-stack-top-frame`). The result is appended to the event's `sourceStack`.

### React state change detection

After DOM events (click/submit/change/input), network responses/errors, and console calls, the SDK calls `scheduleStateDetection(traceId, element)`:

```typescript
const delays = [0, 40, 140]
for (const delay of delays) {
  setTimeout(() => detectStateChanges(target, traceId), delay)
}
```

Each check:

1. **Find fiber root** — `findFiberRoot(element)` walks DOM elements upward looking for `__reactFiber$`, then walks the fiber tree to `stateNode.current`. Falls back to scanning all children of `document.body`.

2. **Walk fiber tree** — recursively traverses via `fiber.child` and `fiber.sibling`. For each function component with hooks:

3. **Compare hook state** — iterates the `memoizedState` linked list on both `fiber` (current) and `fiber.alternate` (previous). If a hook has a `queue.dispatch` (useState/useReducer) and `Object.is(curVal, prevVal)` is false, it's a state change.

4. **Deduplicate** — `emittedStateSignatures[traceId + ':' + component + ':' + hookIndex]` stores the last `prev→current` signature. Same transition is only emitted once per trace.

5. **Emit** — `state-change` event with `{ component, hookIndex, prevValue, value }` and source stack from the fiber's `_debugStack` or `_debugSource`.

### CapturedEvent shape

```typescript
interface CapturedEvent {
  id: string              // uid() — base36 timestamp + random
  traceId: string         // groups related events
  type: EventType         // 'dom' | 'network-request' | 'console' | 'error' | 'state-change' | ...
  timestamp: number       // Date.now()
  seq?: number            // per-session emission counter
  url?: string            // location.href
  data: Record<string, unknown>   // type-specific payload
  sourceStack?: string | null     // V8 stack trace + React component frames
}
```

### File structure

```
packages/web/
├── package.json            v0.1.0, zero deps, MIT
├── tsconfig.json           ES2020, DOM + DOM.Iterable libs
├── tsup.config.ts          ESM + CJS, dts, treeshake, sourcemap
└── src/
    ├── index.ts            init(), destroy(), isActive()
    ├── types.ts            FlowLensWebConfig, CapturedEvent, EventType
    ├── core.ts             uid(), getCurrentTraceId(), newTraceId(), emit()
    ├── transport.ts        WebSocket connect/send/disconnect, reconnect, queue
    ├── patches/
    │   ├── dom.ts          click, input, submit, change, focus, blur
    │   ├── fetch.ts        window.fetch wrapper + trace header injection
    │   ├── xhr.ts          XHR.open/send wrapper + trace header injection
    │   ├── console.ts      console.log/warn/error/info/debug wrapper
    │   └── errors.ts       window.onerror + unhandledrejection
    └── react/
        ├── component-stack.ts   fiber tree → source stack (React 19 + 18)
        └── state-detector.ts    multi-delay state detection + dedup
```

---

## `@flowlens/node` — Backend SDK

Middleware for Node.js HTTP servers. Reads the `X-FlowLens-Trace-Id` header from incoming requests, measures the request lifecycle, captures V8 stack traces at the request entry and response send points, and POSTs the completed span to the FlowLens span collector.

### Install

```bash
npm install @flowlens/node
```

Zero runtime dependencies. Uses only `node:http`. Fastify support requires `fastify` and `fastify-plugin` as optional peer dependencies.

### Usage — Express

```typescript
import express from 'express'
import { flowlens } from '@flowlens/node'

const app = express()

app.use(flowlens({ serviceName: 'orders-api' }))

app.get('/api/orders', (req, res) => {
  res.json([{ id: 1, name: 'Order 1' }])
})

app.listen(3000)
```

### Usage — Fastify

```typescript
import Fastify from 'fastify'
import { flowlensFastify } from '@flowlens/node'

const app = Fastify()

app.register(flowlensFastify({ serviceName: 'products-api' }))

app.get('/api/products', async () => {
  return [{ id: 1, name: 'Product 1' }]
})

app.listen({ port: 3000 })
```

The Fastify plugin tries to wrap with `fastify-plugin` for proper encapsulation. If `fastify-plugin` is not installed, the raw plugin function is used directly.

### Usage — Generic Node HTTP

```typescript
import http from 'node:http'
import { wrapHandler } from '@flowlens/node'

const handler = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Hello')
}

http.createServer(
  wrapHandler(handler, { serviceName: 'simple-server' })
).listen(3000)
```

### Configuration

```typescript
interface FlowLensNodeConfig {
  serviceName: string       // REQUIRED — shown in FlowLens timeline
  collectorUrl?: string     // default: 'http://localhost:9229'
  enabled?: boolean         // default: true
  headerName?: string       // default: 'x-flowlens-trace-id'
}
```

### Middleware lifecycle

All three adapters follow the same pattern:

```
1. Request arrives
2. Read trace ID from X-FlowLens-Trace-Id header
3. No header? → skip entirely, call next/handler (zero overhead)
4. Capture V8 stack trace at request entry (requestStack)
5. Start timer
6. Call next / invoke handler
7. On response finish:
   a. Capture V8 stack trace at response point (responseStack)
   b. Calculate duration
   c. Extract route (req.route.path / routeOptions.url / req.url)
   d. Fire-and-forget POST span to collector
```

The Fastify adapter goes further — it wraps `reply.send()` to capture the response stack at the exact point where the handler sends the response, not just at the `onResponse` hook.

### SpanPayload

The payload POSTed to the span collector:

```typescript
interface SpanPayload {
  traceId: string          // from X-FlowLens-Trace-Id header
  route: string            // req.route.path (Express) / routeOptions.url (Fastify) / req.url
  method: string           // GET, POST, etc.
  statusCode: number       // response status code
  duration: number         // ms from request to response finish
  serviceName: string      // from config
  timestamp: number        // Date.now() at response finish
  sourceStack?: string     // generic fallback stack (= requestStack)
  requestStack?: string    // V8 stack at request entry
  handlerStack?: string    // V8 stack at handler (= requestStack for Express/generic)
  responseStack?: string   // V8 stack at response send
}
```

Express and generic adapters send all four stack fields — `sourceStack`, `requestStack`, and `handlerStack` are all set to the request entry stack, while `responseStack` is captured at response finish. The Fastify adapter sets `handlerStack` to the `onRequest` hook stack and `responseStack` to the `reply.send()` wrapper stack.

### What the collector does with it

When the span arrives at FlowLens (`span-collector.ts`), it resolves per-phase source stacks using `getPhaseStacks()`:

1. Check for `phaseStacks: { request, handler, response }` object
2. Fall back to individual `requestStack` / `handlerStack` / `responseStack` fields
3. Fall back to generic `sourceStack` for any missing phase

Handler stacks are run through `normalizeHandlerStack()` which strips "at traced" wrapper frames.

The span is then split into **3 `backend-span` events** with calculated timestamps:

| Phase | Step | Timestamp | Stack |
|-------|------|-----------|-------|
| `request` | `ingress` | `timestamp - duration` | `requestStack` |
| `handler` | `route-handler` | midpoint | `handlerStack` (normalized) |
| `response` | `egress` | `timestamp` | `responseStack` |

All 3 events share the same `traceId`, so they appear inline in the timeline alongside `network-request` and `network-response` events from the browser.

### Stack capture

`captureStack()` creates a `new Error()` and filters its `.stack`:

```typescript
function captureStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined

  const lines = stack.split('\n')
  const filtered = lines.filter((line) => {
    if (!line.trimStart().startsWith('at ')) return true   // keep "Error" header
    if (line.includes('@flowlens/node')) return false       // strip SDK frames
    if (line.includes('__flowlens_sdk__')) return false
    if (line.includes('node_modules')) return false
    return true
  })

  return filtered.length > 1 ? filtered.join('\n') : undefined
}
```

The renderer's `stack-parser.ts` also filters `@flowlens/web` frames from the frontend SDK's stacks — so instrumentation frames never show up in the source code panel.

### Span sender

`sendSpan()` is fire-and-forget:

```typescript
// sender.ts — simplified
function sendSpan(collectorUrl: string, payload: SpanPayload): void {
  try {
    const body = JSON.stringify(payload)
    const req = http.request({
      hostname, port, path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': ... },
      timeout: 500   // abort if FlowLens is slow
    }, (res) => res.resume())   // drain response to free socket

    req.on('error', () => {})   // silently swallow
    req.on('timeout', () => req.destroy())
    req.write(body)
    req.end()
  } catch {}   // silently swallow
}
```

The middleware never crashes or slows down the user's server. If FlowLens isn't running, nothing happens.

### File structure

```
packages/node/
├── package.json            v0.1.0, zero deps, fastify/fastify-plugin optional peers, MIT
├── tsconfig.json           ES2020, no DOM libs
├── tsup.config.ts          ESM + CJS, dts, treeshake, sourcemap, external: fastify
└── src/
    ├── index.ts            flowlens(), flowlensFastify(), wrapHandler exports
    ├── types.ts            FlowLensNodeConfig, SpanPayload, Express types
    ├── sender.ts           sendSpan() — fire-and-forget HTTP POST
    ├── stack-capture.ts    captureStack() — V8 stack with frame filtering
    └── middleware/
        ├── express.ts      Express middleware (requestStack + responseStack on finish)
        ├── fastify.ts      Fastify plugin (onRequest + reply.send wrap + onResponse)
        └── generic.ts      Raw Node HTTP handler wrapper
```

---

## Building the Packages

Both packages use [tsup](https://tsup.egoist.dev/) for bundling.

```bash
# Build a single package
npm run --workspace=packages/web build
npm run --workspace=packages/node build

# Watch mode
npm run --workspace=packages/web dev
npm run --workspace=packages/node dev
```

tsup config (both packages):

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  treeshake: true,
  clean: true,
  sourcemap: true,
  // @flowlens/node adds: external: ['fastify', 'fastify-plugin']
})
```

Output:

```
dist/
├── index.js         CommonJS
├── index.mjs        ESM
├── index.d.ts       TypeScript declarations
├── index.d.mts      TypeScript declarations (ESM)
└── *.map            Source maps
```

---

## SDK Mode vs Embedded Mode

| | Embedded (paste URL) | SDK (`@flowlens/web` + `@flowlens/node`) |
|---|---|---|
| **How to start** | Enter URL on onboarding page | Click "SDK Mode" on onboarding page |
| **App mode** | `'trace'` | `'sdk-listening'` |
| **Window layout** | Split view: target (left) + UI (right) | Full-width UI (no target view) |
| **Frontend instrumentation** | IIFE injected via `executeJavaScript()` | `init()` called from your app |
| **Backend spans** | Manual `curl` POST to `:9229` | `@flowlens/node` middleware auto-posts |
| **Transport** | IPC (`instrumentation:event`) | WebSocket `:9230` + HTTP POST `:9229` |
| **Double-patch guard** | Sets `window.__flowlens_instrumented` | Checks same flag before patching |
| **Source code** | Fetched by main process | Same fetcher, same stack parsing |
| **React support** | Identical fiber walking + state detection | Same code, packaged as npm module |
| **When to use** | Quick inspection of any URL | Your own app during development |

Both modes can be active simultaneously — the trace engine merges all events.

---

## End-to-End Example

1. **Start FlowLens** — `npm run dev` (boots desktop app + servers on :9229 and :9230)

2. **Add `@flowlens/web` to your React frontend:**
```typescript
// src/main.tsx
import { init } from '@flowlens/web'

if (import.meta.env.DEV) {
  init()  // patches DOM, fetch, XHR, console, errors; connects WS to :9230
}
```

3. **Add `@flowlens/node` to your Express backend:**
```typescript
// src/server.ts
import express from 'express'
import { flowlens } from '@flowlens/node'

const app = express()
app.use(flowlens({ serviceName: 'my-api' }))
// ... routes
app.listen(3000)
```

4. **Start your app** — `npm run dev` for frontend, `node server.ts` for backend

5. **Click "SDK Mode"** in FlowLens — the UI shows "SDK Mode" with a connection count badge. As your frontend connects, the count updates in real time.

6. **Interact with your app** — every click, network call, console log, error, and state change streams into the FlowLens timeline. Backend request spans appear inline, correlated by trace ID. Click any event to see its source code and call stack. Use arrow keys to step through the execution flow.
