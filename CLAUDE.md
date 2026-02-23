# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowLens is a developer-focused debugging and tracing desktop application built with Electron. It provides unified visibility into frontend execution flows, network calls, backend spans, and telemetry logs — all in one place. Users paste a URL, Electron loads it in an embedded browser, injected JS captures events, and a trace correlation engine builds causal execution graphs displayed in a React-based timeline UI.

**Current state:** Pre-implementation. Architecture and design docs exist but no source code has been written yet. See `Architecture.md` for the full technical design and `Design.md` for frontend aesthetic guidelines.

## Architecture

**Core components (planned):**
- **Electron App** — Host environment (Chromium + Node.js) with embedded browser for loading target URLs
- **Frontend Instrumentation** — JS injected into browser WebContents to capture UI events, React lifecycle events, and network calls (XHR/fetch). Assigns trace IDs automatically with zero user code changes
- **Trace Correlation Engine** — Matches frontend events, network calls, and backend spans by trace ID/timestamp; builds causal execution graphs; in-memory store with TTL
- **Backend Instrumentation (optional)** — Users link a backend folder for deeper tracing via OpenTelemetry auto-instrumentation or vendor SDKs (Datadog, Sentry)
- **Telemetry Connectors** — Query Sentry, PostHog, and other provider APIs to fetch logs/errors/events correlated with traces
- **Visualization UI** — React-based panels: unified trace timeline, execution flow graph, details inspector, filters/search, telemetry sidebar

**Data flow:** User pastes URL → Electron loads page → Injected JS captures events → Event stream to correlation engine → Optional backend spans added → Telemetry connectors fetch external data → UI renders unified timeline

## Tech Stack (Planned)

- **Desktop:** Electron (Electron Forge / Vite / ESBuild)
- **UI:** React
- **Tracing:** OpenTelemetry concepts for trace/span ID propagation
- **Telemetry:** Sentry API, PostHog API

## Design Philosophy

The frontend must avoid generic "AI slop" aesthetics. Key principles from `Design.md`:
- Bold, intentional aesthetic direction (not safe/generic)
- Distinctive typography — never default to Inter, Roboto, Arial
- Cohesive color themes via CSS variables; dominant colors with sharp accents
- CSS animations for high-impact moments; staggered reveals over scattered micro-interactions
- Unexpected layouts: asymmetry, overlap, grid-breaking elements
- Atmosphere through textures, gradients, shadows — not flat solid backgrounds
