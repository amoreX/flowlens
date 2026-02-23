# FlowLens Backend SDK Package Plan

## Objective

Create an installable SDK package so any backend service can be FlowLens-traceable with minimal setup.

Primary outcome:
- Backend developers should only need to install one package and wire one middleware/helper.
- FlowLens should consistently receive correlated backend spans with usable source locations.

---

## Why This Package

Current pain points without a package:
- Each backend team must manually implement trace header parsing, timing, span posting, and source capture.
- Inconsistent span payloads cause missing source locations in FlowLens.
- Debug behavior varies across frameworks and runtime setups.

Package value:
- Standardized payload contract.
- Framework adapters for drop-in integration.
- Safe defaults (no app-breaking errors, non-blocking span post, robust fallbacks).

---

## Package Scope

Proposed package name:
- `@flowlens/node`

Target runtime:
- Node.js backends first.

Framework support (v1):
- Express (first-class).
- Generic Node HTTP helper.

Framework support (v1.1+):
- Fastify adapter.
- Koa adapter.
- NestJS interceptor/middleware helper.

Non-Node language SDKs (future):
- Python, Go, Java wrappers that emit same span JSON contract.

---

## Required Data Contract (Collector-Compatible)

Each span POST to FlowLens collector (`http://localhost:9229` by default) should include:

- `traceId` (required)
- `route` (required)
- `method` (required)
- `statusCode` (required)
- `duration` (required, ms)
- `serviceName` (required)
- `timestamp` (required, ms epoch)
- Source info (at least one of):
  - `sourceStack` (preferred full V8-like stack)
  - `stack` (alias)
  - `sourceFile` + `sourceLine` (fallback format)
  - optional `sourceColumn`, `sourceFunction`

Notes:
- `sourceStack` is best for call stack fidelity and future advanced UI.
- SDK should always try to provide `sourceStack`, even if via fallback capture.

---

## SDK Public API (Proposed)

## `createFlowLens(config)`

Config:
- `serviceName: string` (required)
- `collectorUrl?: string` (default `http://localhost:9229`)
- `enabled?: boolean` (default true outside production opt-out)
- `headerName?: string` (default `x-flowlens-trace-id`)
- `timeoutMs?: number` (default 500)
- `captureRequestStack?: boolean` (default true)
- `logDebug?: boolean` (default false)

Returns:
- `middleware()` for request lifecycle capture
- `traced(handler)` wrapper for stable handler-definition source stack
- `sendSpan(span)` low-level manual emitter
- `extractTraceId(req)` utility

### Express usage

```ts
import express from 'express'
import { createFlowLens } from '@flowlens/node'

const app = express()
const flowlens = createFlowLens({
  serviceName: 'orders-api',
  collectorUrl: process.env.FLOWLENS_COLLECTOR_URL
})

app.use(flowlens.middleware())

app.get('/api/orders', flowlens.traced(async (_req, res) => {
  res.json([{ id: 1 }])
}))
```

### Generic usage

```ts
const flowlens = createFlowLens({ serviceName: 'worker' })

await flowlens.sendSpan({
  traceId,
  route: 'job:process-order',
  method: 'JOB',
  statusCode: 200,
  duration: 42,
  serviceName: 'worker',
  timestamp: Date.now(),
  sourceStack: new Error().stack
})
```

---

## Internal Design

## Trace propagation

- Read incoming trace ID from header `x-flowlens-trace-id`.
- If missing, skip emission (do not create fake IDs in backend SDK).
- Keep behavior deterministic and side-effect free for non-traced requests.

## Source capture strategy

Priority order:
1. `traced(handler)` captured definition stack (best line fidelity for route handler origin)
2. request-time stack fallback (`new Error().stack` in middleware)
3. file/line fallback synthesis if provided manually

## Posting strategy

- Non-blocking HTTP POST.
- Timeout-protected.
- Fail-open (errors never break app request path).
- Optional debug logging.

## Payload hygiene

- Limit oversized stack strings if needed (configurable cap).
- Ensure JSON-safe serialization.

---

## Implementation Plan

## Phase 1: Core package scaffold

- Create package directory: `packages/flowlens-node/`
- `src/index.ts` exports `createFlowLens`.
- Add core sender (`sendSpan`) and config normalization.
- Add unit tests for payload format and error handling.

Deliverable:
- Basic SDK with manual `sendSpan`.

## Phase 2: Express adapter

- Implement `middleware()`:
  - read trace header
  - start timer
  - capture request stack
  - hook `res.on('finish')`
  - emit span
- Implement `traced(handler)` wrapper:
  - capture definition stack once
  - attach to response locals for middleware to use

Deliverable:
- 1-line integration in Express apps.

## Phase 3: Robustness and compatibility

- Add alias support for source keys (`sourceStack`, `stack`).
- Add source fallback fields (`sourceFile`, `sourceLine`, etc).
- Add configurable header name and collector URL.
- Add retry policy option (off by default).

Deliverable:
- Production-safe behavior.

## Phase 4: Framework adapters and docs

- Add Fastify and Koa adapters.
- Add migration guide and troubleshooting docs.
- Add complete examples repo snippets.

Deliverable:
- Multi-framework support with clear docs.

---

## Testing Plan

## Unit tests

- config defaults and overrides
- trace ID extraction logic
- span payload shape
- source stack fallback selection
- timeout and fail-open behavior

## Integration tests

- spin up mock collector server
- verify Express middleware emits expected payload on traced requests
- verify no emission when trace header absent
- verify `traced(handler)` line locations are stable

## Manual E2E

- run FlowLens desktop + example backend + example frontend
- click frontend action
- verify `SVC` event appears in trace
- verify source panel opens backend file and highlights correct line

---

## Release Plan

## Versioning

- Start at `0.1.0` (experimental).
- Move to `1.0.0` when API stabilizes.

## Packaging

- Publish to npm as public package.
- Include:
  - `README.md`
  - typed exports
  - usage snippets per framework
  - troubleshooting section

## Adoption path

- Integrate SDK into current `test-back` first.
- Dogfood with at least one additional backend app.
- Promote as official FlowLens backend integration method.

---

## Troubleshooting Guide (to include in package README)

Common issues and checks:

- No backend `SVC` event:
  - check backend receives `x-flowlens-trace-id`
  - check collector URL reachable from backend

- `SVC` event with no source:
  - verify payload includes `sourceStack` or source fallback fields
  - ensure backend route uses `traced(handler)` or request stack fallback is enabled

- Stale/cached spans:
  - disable caching for traced API routes (`Cache-Control: no-store`, ETag config as needed)

- Collector errors:
  - ensure FlowLens app is running and listening on `:9229`

---

## Success Criteria

- New backend integration takes <10 minutes.
- Backend spans consistently include source location.
- FlowLens source panel opens backend files for `SVC` events.
- Existing frontend/source highlighting remains accurate.

---

## Future Enhancements

- Async context propagation helper (`AsyncLocalStorage`) for deeper internal spans.
- OpenTelemetry bridge mode (convert OTel spans to FlowLens payload).
- Automatic framework plugin discovery.
- Batched span transport for high-throughput backends.
