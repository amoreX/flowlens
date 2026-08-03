# FlowLens

FlowLens is an Electron desktop debugging tool for tracing frontend and backend behavior in one timeline.

Paste a URL and FlowLens loads your app in an embedded browser, auto-injecting instrumentation that captures every DOM event, network call, console log, runtime error, and React state change — zero code changes required on the frontend.

For backend correlation, install `@nihal/flowlens-node` in your backend. FlowLens injects a trace ID header (`X-FlowLens-Trace-Id`) into all outgoing fetch/XHR requests. The backend middleware reads this header and reports spans back to FlowLens, so frontend and backend events appear in the same trace.

## How It Works

```text
┌───────────────────────┐                    ┌──────────────────┐
│  Your app (embedded)  │  WS :9230          │  FlowLens        │
│  auto-instrumented    │ ──────────────────▶│  Trace Engine    │
│  by FlowLens          │                    │  + Timeline UI   │
└───────────────────────┘                    │                  │
         │ X-FlowLens-Trace-Id               │                  │
         ▼                                   │                  │
┌───────────────────────┐  HTTP POST :9229   │                  │
│  Your backend         │ ──────────────────▶│                  │
│  @nihal/flowlens-node │                    └──────────────────┘
└───────────────────────┘
```

On page load, FlowLens injects a browser bundle into the embedded view and calls `FlowLensWeb.init()`. This monkey-patches `fetch`, `XMLHttpRequest`, `console.*`, DOM event listeners, `window.onerror`, and React state hooks. Events stream to the built-in WebSocket server on `:9230`, are grouped by trace ID, and rendered in the timeline.

## Key Features

- Automatic trace grouping by user interaction
- Frontend + backend correlation via `X-FlowLens-Trace-Id`
- React state-change detection (`useState` / `useReducer`)
- **Element inspector** — hover over elements in the embedded page to see tag, classes, dimensions, React component name, and source location; click to navigate to the component's source file
- Source-code mapping and stack-based line highlighting
- Inline event stepping with flow navigation
- DOM element highlighting in embedded view during event navigation
- Bottom tabbed panel: Console + Inspector (state changes / responses)
- Resizable split view and panel dividers

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` builds the instrumentation bundle first, then starts Electron dev mode. Paste a URL into the onboarding screen and FlowLens loads your app with full instrumentation — no frontend code changes needed.

## Backend Tracing

Install `@nihal/flowlens-node` in your backend to capture server-side spans:

```bash
npm install @nihal/flowlens-node
```

### Express

```js
const cors = require('cors')
const { flowlens } = require('@nihal/flowlens-node')

app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'X-FlowLens-Trace-Id']
}))
app.use(flowlens({ serviceName: 'my-api' }))
```

### Fastify

```ts
import { flowlensFastify } from '@nihal/flowlens-node'
app.register(flowlensFastify({ serviceName: 'my-api' }))
```

### Raw node:http

```ts
import { wrapHandler } from '@nihal/flowlens-node'
const traced = wrapHandler(handler, { serviceName: 'my-api' })
http.createServer(traced)
```

The CORS `allowedHeaders` must include `X-FlowLens-Trace-Id` so the browser permits the trace header on cross-origin requests. The middleware reads the trace ID from incoming requests and POSTs span data to FlowLens on `:9229`. Each span appears as three events in the timeline: ingress, route-handler, and egress. Zero overhead when the trace header is absent.

### Config

```ts
flowlens({
  serviceName: 'my-api',                // required
  collectorUrl: 'http://localhost:9229', // default
  enabled: true,                         // default
  headerName: 'x-flowlens-trace-id'     // default
})
```

## Build

```bash
npm run build
npm run build:mac
npm run build:win
npm run build:linux
```

## Project Structure

```text
src/
  main/            Electron main process (trace engine, target view, collectors, WS, IPC)
  preload/         Renderer/target bridge APIs
  renderer/src/    React UI
  shared/          Shared event and trace types
packages/
  web/             Internal instrumentation bundle (auto-injected into embedded pages)
  node/            @nihal/flowlens-node backend span SDK
```

## Troubleshooting

**No backend spans appearing:**
- Verify your backend is running and `@nihal/flowlens-node` middleware is installed
- CORS must allow `X-FlowLens-Trace-Id` in `allowedHeaders`
- The middleware only sends spans when the trace header is present — if the frontend isn't loaded through FlowLens, no header is injected

**Events appear but no source code:**
- Source resolution works for HTTP URLs matching a running dev server
- Make sure your frontend dev server is running so FlowLens can fetch source files

**Port in use:**
- If port 9229 or 9230 is already in use, FlowLens disables that server
- `lsof -ti:9229 -ti:9230 | xargs kill -9`

## Docs

- Dev architecture details: `readme_dev.md`
- Package details: `readme_package.md`
