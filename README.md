# FlowLens

A desktop debugging tool that gives you full visibility into what your web app is doing. Load any URL, and FlowLens automatically captures every click, network request, console log, and error — grouped into execution traces and mapped back to your source code. No SDK, no code changes.

## How It Works

FlowLens runs your target site in an embedded browser alongside a debugging UI in a resizable split view. JavaScript instrumentation is injected automatically on page load — it monkey-patches DOM events, fetch, XHR, console, and error handlers to capture everything that happens. It also walks the React fiber tree (React 18 and 19) to extract component-level source locations and detect state changes. A `X-FlowLens-Trace-Id` header is injected into all outgoing fetch/XHR requests so backends can correlate spans with frontend traces.

## Features

- **Automatic tracing** — click/submit starts a new trace; subsequent network calls, console output, errors, and state changes are grouped under it
- **Backend span collection** — built-in HTTP collector on port 9229 receives backend spans (split into request/handler/response phases) correlated by trace ID
- **React state tracking** — detects useState/useReducer changes after interactions, showing prev/current values per component
- **Source code viewer** — see exactly which line of your code triggered each event, with full call stack navigation
- **Source map extraction** — automatically extracts original source from inline source maps served by dev servers; also reads backend source directly from disk via filesystem paths and `file://` URLs
- **Dual-mode highlighting** — live mode shows real-time hit accumulation (orange); focus mode shows a selected event's execution path (amber)
- **Flow navigation** — step through events in a trace with arrow keys to walk through the execution path
- **Console panel** — filterable console output (log, warn, error, info, debug) captured from the target page
- **Resizable split view** — draggable boundary between target site and debugging UI (20–80%), plus draggable internal panel dividers

## Getting Started

```bash
npm install
npm run dev
```

This starts FlowLens in development mode with hot reload. Enter a URL (e.g. `http://localhost:3099` if you have a local dev server running) and start interacting with the page. Source code is loaded from your dev server — original source is automatically extracted from inline source maps when available.

To collect backend spans, POST them to `http://localhost:9229` with a JSON body containing `traceId`, `route`, `method`, `statusCode`, `duration`, `serviceName`, and `timestamp`. Optionally include `sourceStack` (V8 stack string), or `sourceFile` + `sourceLine` for source mapping.

## Build

```bash
# Typecheck and build for production
npm run build

# Platform-specific builds
npm run build:mac
npm run build:win
npm run build:linux
```

## Tech Stack

Electron 34, React 19, TypeScript, electron-vite 3, vanilla CSS.

## Project Structure

```
src/
├── main/           Electron main process (trace engine, source fetcher, span collector, IPC)
├── preload/        Context bridge APIs (renderer + target page)
├── renderer/src/   React UI (timeline, source panel, console, flow navigator)
└── shared/         Type definitions shared across processes
```

See `readme_dev.md` for a detailed architecture walkthrough.
