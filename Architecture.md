# Architecture — FlowLens

## 🧠 Overview

**FlowLens** is a **developer-focused debugging and tracing desktop application** built with Electron that provides *unified visibility* into frontend execution flows, network calls, backend spans, and telemetry logs — all without users having to switch tools or configure multiple SDKs. It supports *zero-configuration frontend instrumentation*, optional backend tracing, and integration with existing telemetry platforms (e.g., Sentry, PostHog, etc.).

The goal is to empower developers to debug faster, understand causal flows across the entire stack, and see correlated logs/errors in real time — all in one place.

---

## 🔗 1. Architectural Principles

### ✨ Key Concepts
- **Full-stack Tracing:** Capture end-to-end flows from UI interactions to backend processing via causal event graphs. This includes UI events, network activity, backend spans, and telemetry logs.  
- **Zero-Config First:** Frontend tracing works *without modifying user code* via runtime script injection in the embedded browser environment.  
- **Optional Backend Depth:** Deeper backend spans when users link their backend code or enable optional instrumentation.  
- **Telemetry Integration:** Integrate with external systems (Sentry, PostHog) to show logs, errors, and session information correlated with trace context.  
- **Developer-Centric UX:** Rich, interactive timeline and detail views tailored to debugging use cases.

---

## 🔌 2. Core Components & Tech Stack
Electron App (UI + Browser)
│
├── Instrumentation Injection
│ (Injected JS in Browser WebContents)
│
├── Trace Correlation Engine
│ (Frontend + Backend + Telemetry)
│
├── Data Store
│ (In-memory / Indexed for session)
│
├── Telemetry Connectors
│ (Sentry, PostHog, other APIs)
│
└── Visualization UI
(React, interactive trace explorer)


### 🧩 **Electron Desktop App**
- **Host Environment:** Electron (Chromium + Node.js)
- **UI Framework:** React (or other JS UI stack)
- **Dev Tools:** Electron Forge / Vite / ESBuild
- Provides a dedicated debugging browser context and desktop UI.

### 📍 **Frontend Instrumentation**
- **Injection Script:** Inject JS into embedded browser to capture:
  - UI events
  - Framework lifecycle events (React hooks)
  - Network calls (XHR, fetch)
- Assigns trace IDs and forwards captured events to the engine.

> This runtime script provides automatic *frontend tracing* without user code changes. It simulates *instrumentation* by intercepting browser behavior.  
> (This parallels how tools leverage OpenTelemetry to propagate trace context, but optimized for zero-config local dev) :contentReference[oaicite:0]{index=0}

### 📍 **Backend Instrumentation (Optional)**
- Users may link a backend folder to deepen observability.
- **Automatic Instrumentation/Agents:**  
  - Use auto-instrumentation (agents or injected libraries) based on backend language/framework (e.g., OpenTelemetry or vendor SDKs).  
  - These agents can generate spans without heavy code changes.  
  - Tools like Datadog or Sentry provide automatic agents that hook into standard libraries and frameworks at runtime for tracing. :contentReference[oaicite:1]{index=1}

### 📍 **Trace Correlation Engine**
- Core service that:
  - Matches frontend events, network calls, backend spans
  - Matches trace IDs & timestamps
  - Builds causal execution graphs
  - Normalizes events for visualization
- In-memory store with TTL (short-lived) for session traces.

### 📍 **Telemetry Integrations (Sentry, PostHog, etc.)**
- **Connectors:** Query provider APIs for logs/errors/events associated with traces.
- **Correlation:** Use trace IDs, timestamps, and request metadata to merge telemetry with FlowLens traces.
- **Real-time UX:** Display structured logs + errors inline alongside execution timeline.

### 📍 **Visualization UI**
- Panels include:
  - **Unified Trace Timeline**
  - **Execution Flow Graph**
  - **Details Inspector**
  - **Filters & Search**
  - **Telemetry Sidebar**

UX prioritizes causal clarity over raw logs, allowing expand/collapse, hover details, breakpoint-like views, and interactive drill-downs.

---

## 🌀 3. Data Flow
User Paste URL → Electron loads in Browser
↓
Injected JS Captures UI/Network Events
↓
Event Stream → Trace Correlation Engine
↓
Backend (Optional) Auto-Instrumentation
↓
Spans + Traces Indexed in Store
↓
Telemetry Connectors Fetch Logs/Errors
↓
UI Renders Unified Timeline


---

## 🧠 4. UX Plan

### 🟢 **Simple Onboarding**
- Startup screen: paste URL
- Optional: link backend folder
- Optional: connect telemetry providers

### 🟡 **Unified Trace Explorer**
- **Horizontal Trace Timeline:** Shows root events (UI action → network → backend)
- **Causal View:** Nested hierarchy of events
- **Details on Demand:** Clicking reveals logs, request/response contents, telemetry events

### 🔍 **Filters & Search**
- Filter by:
  - Component name
  - Endpoint
  - Errors only
  - Trace duration

### 🟣 **Telemetry Sidebar**
- Error logs heated mapped to trace points
- Session or behavioral context (from PostHog/others)

---

## 📆 5. Implementation Roadmap

### 🟠 **Phase 1 — MVP**
- Build Electron app scaffold
- Implement injected frontend instrumentation
- Basic trace correlation with network calls
- Timeline UI

### 🟡 **Phase 2 — Backend Depth**
- Support backend folder linking
- Auto-instrumentation with OpenTelemetry / agents
- Backend spans integrated into timeline

### 🟢 **Phase 3 — Telemetry Integrations**
- Connect to Sentry, PostHog via APIs
- Correlate logs/TEL events in timeline

### 🔵 **Phase 4 — Advanced UX & Collaboration**
- Search/filters
- Team session sharing
- Trace export

---

## 🧱 6. Telemetry & Integrations

### 📍 **Sentry**
- Use Sentry API or SDK to fetch logs/errors and performance spans.  
- Sentry’s automatic instrumentation for Electron supports spans for navigation and network requests and can propagate trace headers. :contentReference[oaicite:2]{index=2}

### 📍 **PostHog**
- Query events & session data to correlate with traces.
- Provides insight into user actions/analytics.

### 📍 **Other Providers**
- Optional connectors for Datadog, LogRocket, etc.

---

## 🛡️ 7. Performance & Security Considerations

- **Dev-Mode Only:** Heavy tracing overhead is acceptable during development.
- **No External Data by Default:** Unless explicitly linked to telemetry providers.
- **CSP Bypass via Electron:** Scripts injected only in the embedded browser.

---

## 🧠 8. Observability Context (Best Practices)

FlowLens uses principles similar to **full-stack observability** — correlating metrics, logs, and traces across systems. Full-stack observability enables end-to-end visibility, which FlowLens provides through trace correlation and telemetry integration. :contentReference[oaicite:3]{index=3}

OpenTelemetry concepts (trace/span ID propagation, distributed trace structures) inform trace correlation strategy within FlowLens. :contentReference[oaicite:4]{index=4}

---

## 📌 Summary

FlowLens is a **zero-friction, developer-first debugging experience** that combines:

- Runtime frontend instrumentation
- Optional deep backend tracing
- Telemetry integration
- Rich timeline and causal views

All while reducing context switches and manual logging. It’s both practical *and ambitious*, aligning with modern observability paradigms to deliver deep insights into code execution flows.

---
