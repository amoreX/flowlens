# FlowLens SDK Plan — Completed

This file was originally a design plan for the SDK packages. The plan is fully implemented.

## Current Status

- `@nihal/flowlens-node` — implemented in `packages/node/`
- `@nihal/flowlens-web` — implemented in `packages/web/`
- Embedded mode injects the built web SDK bundle (`dist/browser.global.js`)
- SDK mode is fully supported in the desktop app UI

## Implemented Backend SDK API

Exports from `@nihal/flowlens-node`:

- `flowlens(config)` — Express-style middleware
- `flowlensFastify(config)` — Fastify plugin
- `wrapHandler(handler, config)` — generic `node:http` wrapper

There is no `createFlowLens()` API in the current implementation.

## Live Documentation

- Architecture and app behavior: `readme_dev.md`
- SDK usage and package details: `readme_package.md`
- Quick start and overview: `README.md`
