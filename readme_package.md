# FlowLens Packages

## Package Layout

```text
packages/
  web/   Internal instrumentation bundle (private, not published)
  node/  @nihal/flowlens-node
```

Root workspace uses:

```json
"workspaces": ["packages/*"]
```

---

## Data Pipeline

```text
Embedded page (injected bundle) -- WebSocket (:9230) --> src/main/ws-server.ts
                                                                    \
                                                                     +--> TraceCorrelationEngine
                                                                    /        --> renderer via trace:event-received
@nihal/flowlens-node ----------- HTTP POST (:9229) --> src/main/span-collector.ts
```

FlowLens correlates everything by `traceId` (propagated through `X-FlowLens-Trace-Id`).

---

## Internal: `packages/web`

The `packages/web` directory contains the instrumentation code that FlowLens auto-injects into embedded pages. It is **not** published to npm — it is an internal build artifact.

`target-view.ts` reads `packages/web/dist/browser.global.js` (the IIFE bundle) and injects it into every loaded page, then calls `FlowLensWeb.init()`.

### What it captures

- DOM events (`click`, `submit`, `input`, `change`, `focus`, `blur`)
- `fetch` + XHR request/response/error
- `console.*`
- Runtime errors (`onerror`, `unhandledrejection`)
- React state changes (multi-delay checks at 0/40/140ms)

### Important behavior

- `click`/`submit` creates new trace ID
- Injects `X-FlowLens-Trace-Id` on outgoing HTTP requests for backend correlation
- Includes `bodyPreview` on network responses
- Uses frame filtering so instrumentation internals do not pollute source highlights
- Guards against double instrumentation with `window.__flowlens_instrumented`

### Build outputs

`packages/web/tsup.config.ts` builds:

- ESM + CJS package entry
- IIFE global bundle: `dist/browser.global.js` (`globalName: FlowLensWeb`)

---

## `@nihal/flowlens-node`

The backend SDK for server-side span collection. Install this in your backend to correlate server events with frontend traces.

### Install

```bash
npm install @nihal/flowlens-node
```

### Adapters

- `flowlens()` for Express-style middleware
- `flowlensFastify()` for Fastify
- `wrapHandler()` for raw `node:http` handlers

### Config

```ts
interface FlowLensNodeConfig {
  serviceName: string
  collectorUrl?: string // default http://localhost:9229
  enabled?: boolean     // default true
  headerName?: string   // default x-flowlens-trace-id
}
```

### Behavior

- Reads trace ID header from incoming request
- Skips overhead if trace ID absent
- Captures request/handler/response stacks
- Sends span payload fire-and-forget to collector
- Fastify wraps `reply.send()` to capture accurate response stack point

### Span payload fields

- `traceId`, `route`, `method`, `statusCode`, `duration`, `serviceName`, `timestamp`
- `requestStack`, `handlerStack`, `responseStack` (plus generic `sourceStack`)

Collector expands one span into three `backend-span` events (`request`, `handler`, `response`) with per-phase stacks.

### Usage

```js
// Express
const { flowlens } = require('@nihal/flowlens-node')

app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'X-FlowLens-Trace-Id']
}))
app.use(flowlens({ serviceName: 'my-api' }))
```

```ts
// Fastify
import { flowlensFastify } from '@nihal/flowlens-node'
app.register(flowlensFastify({ serviceName: 'my-api' }))
```

```ts
// Raw node:http
import { wrapHandler } from '@nihal/flowlens-node'
const traced = wrapHandler(handler, { serviceName: 'my-api' })
http.createServer(traced)
```

---

## Build Commands

```bash
# Build individual packages
npm run --workspace @nihal/flowlens-web build
npm run --workspace @nihal/flowlens-node build

# Watch
npm run --workspace @nihal/flowlens-web dev
npm run --workspace @nihal/flowlens-node dev
```

Root scripts:

- `npm run build:web-sdk` builds the instrumentation bundle first
- `npm run dev` and `npm run build` call this automatically

---

## Quick End-to-End Setup

1. Start FlowLens desktop: `npm run dev`
2. Backend: install `@nihal/flowlens-node`, attach middleware/plugin
3. In FlowLens, paste your frontend URL (e.g. `http://localhost:3099`)
4. Use your app; traces appear with frontend and backend events correlated
