# FlowLens

FlowLens is an Electron desktop debugging tool for tracing frontend and backend behavior in one timeline.

You can use it in two ways:

- **Embedded mode**: paste a URL and FlowLens loads your app in an embedded browser.
- **SDK mode**: instrument your own apps directly with `@flowlens/web` and `@flowlens/node`.

## How It Works

### Embedded mode

On page load, FlowLens injects the browser bundle built from `@flowlens/web` into the target view and calls `FlowLensWeb.init()`.  
That captures DOM events, network calls, console logs, runtime errors, and React state changes, then streams events to the built-in WebSocket server (`ws://localhost:9230`).

### SDK mode

- `@flowlens/web` (frontend) sends events over WS `:9230`
- `@flowlens/node` (backend) posts spans to HTTP collector `:9229`

Both feeds are correlated by `traceId` and rendered in the same timeline.

## Key Features

- Automatic trace grouping by user interaction
- Frontend + backend correlation via `X-FlowLens-Trace-Id`
- React state-change detection (`useState` / `useReducer`)
- Source-code mapping and stack-based line highlighting
- Inline event stepping with flow navigation
- Bottom tabbed panel: Console + Inspector (state changes / responses)
- Resizable split view and panel dividers

## Getting Started

```bash
npm install
npm run dev
```

`npm run dev` now builds the web SDK bundle first, then starts Electron dev mode.

## Build

```bash
npm run build
npm run build:mac
npm run build:win
npm run build:linux
```

`npm run build` also builds the web SDK bundle first.

## Project Structure

```text
src/
  main/            Electron main process (trace engine, target view, collectors, WS, IPC)
  preload/         Renderer/target bridge APIs
  renderer/src/    React UI
  shared/          Shared event and trace types
packages/
  web/             @flowlens/web frontend instrumentation SDK
  node/            @flowlens/node backend span SDK
```

- Dev architecture details: `readme_dev.md`
- SDK/package details: `readme_package.md`
