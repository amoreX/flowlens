# FlowLens

A desktop debugging tool that gives you full visibility into what your web app is doing. Load any URL, and FlowLens automatically captures every click, network request, console log, and error — grouped into execution traces and mapped back to your source code. No SDK, no code changes.

## How It Works

FlowLens runs your target site in an embedded browser alongside a debugging UI. JavaScript instrumentation is injected automatically on page load — it monkey-patches DOM events, fetch, XHR, console, and error handlers to capture everything that happens. Events are grouped into traces (a click and all the network calls, logs, and errors it triggers), and displayed in a real-time timeline with source code context.

## Features

- **Automatic tracing** — click/submit starts a new trace; subsequent network calls, console output, and errors are grouped under it
- **Source code viewer** — see exactly which line of your code triggered each event, with full call stack navigation
- **Live hit highlighting** — lines light up in real-time as your code executes, with intensity based on hit frequency
- **Flow navigation** — step through events in a trace with arrow keys to walk through the execution path
- **Console panel** — filterable console output (log, warn, error, info, debug) captured from the target page
- **Resizable split view** — target site on the left, debugging UI on the right, all panels draggable

## Getting Started

```bash
npm install
npm run dev
```

This starts FlowLens in development mode with hot reload. Enter a URL (e.g. `http://localhost:3099` if you have a local dev server running) and start interacting with the page.

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
├── main/           Electron main process (trace engine, source fetcher, IPC, window management)
├── preload/        Context bridge APIs (renderer + target page)
├── renderer/src/   React UI (timeline, source panel, console, flow navigator)
└── shared/         Type definitions shared across processes
```

See `readme_dev.md` for a detailed architecture walkthrough.
