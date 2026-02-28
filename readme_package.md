# FlowLens SDK Packages

FlowLens uses two SDKs:

- `@flowlens/web` for frontend/browser instrumentation
- `@flowlens/node` for backend span reporting

These power **SDK mode** and are also used in **embedded mode** (the desktop app injects the built web bundle).

---

## Package Layout

```text
packages/
  web/   @flowlens/web
  node/  @flowlens/node
```

Root workspace uses:

```json
"workspaces": ["packages/*"]
```

---

## Data Pipeline

```text
@flowlens/web  -- WebSocket (:9230) --> src/main/ws-server.ts
@flowlens/node -- HTTP POST (:9229) --> src/main/span-collector.ts
                                      --> TraceCorrelationEngine
                                      --> renderer via trace:event-received
```

FlowLens correlates everything by `traceId` (propagated through `X-FlowLens-Trace-Id`).

---

## `@flowlens/web`

### Install

```bash
npm install @flowlens/web
```

### Basic usage

```ts
import { init } from '@flowlens/web'

if (import.meta.env.DEV) {
  init()
}
```

### API

- `init(config?)`
- `destroy()`
- `isActive()`

### Config

```ts
interface FlowLensWebConfig {
  endpoint?: string          // default ws://localhost:9230
  enabled?: boolean          // default true
  patchDOM?: boolean         // default true
  patchFetch?: boolean       // default true
  patchXHR?: boolean         // default true
  patchConsole?: boolean     // default true
  captureErrors?: boolean    // default true
  detectReactState?: boolean // default true
}
```

### Captures

- DOM events (`click`, `submit`, `input`, `change`, `focus`, `blur`)
- `fetch` + XHR request/response/error
- `console.*`
- runtime errors (`onerror`, `unhandledrejection`)
- React state changes (multi-delay checks)

### Important behavior

- `click`/`submit` creates new trace ID
- Injects `X-FlowLens-Trace-Id` on outgoing HTTP requests
- Includes `bodyPreview` on network responses
- Uses frame filtering so SDK internals do not pollute source highlights
- Guards against double instrumentation with `window.__flowlens_instrumented`

### Build outputs

`packages/web/tsup.config.ts` builds:

- ESM + CJS package entry
- IIFE global bundle: `dist/browser.global.js` (`globalName: FlowLensWeb`)

The desktop app injects this IIFE in embedded mode.

---

## `@flowlens/node`

### Install

```bash
npm install @flowlens/node
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

---

## Embedded vs SDK Mode

| Topic | Embedded mode | SDK mode |
|---|---|---|
| Frontend instrumentation | Injects `dist/browser.global.js` in target view | You call `init()` in your app |
| Backend spans | Optional manual posts or SDK | `@flowlens/node` middleware |
| Renderer layout | Split view with embedded page | Full-width tracing UI |
| Transport | WS + IPC pipeline in desktop app | WS (`@flowlens/web`) + HTTP (`@flowlens/node`) |

---

## Build Commands

```bash
# Build individual packages
npm run --workspace @flowlens/web build
npm run --workspace @flowlens/node build

# Watch
npm run --workspace @flowlens/web dev
npm run --workspace @flowlens/node dev
```

Root scripts:

- `npm run build:web-sdk` builds `@flowlens/web` first
- `npm run dev` and `npm run build` call this automatically

---

## Quick End-to-End Setup

1. Start FlowLens desktop: `npm run dev`
2. Frontend: install `@flowlens/web`, call `init()` in dev
3. Backend: install `@flowlens/node`, attach middleware/plugin
4. In FlowLens onboarding, click **SDK Mode**
5. Use your app; traces appear with frontend and backend events correlated
