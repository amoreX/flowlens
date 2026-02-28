# FlowLens SDK Plan Status

This file was originally a design plan for the backend package.  
The plan is now implemented and superseded by live docs.

## Current Status

- `@flowlens/node` is implemented in `packages/node`
- `@flowlens/web` is implemented in `packages/web`
- Embedded mode now injects the built web SDK bundle (`dist/browser.global.js`)
- SDK mode is fully supported in the desktop app UI

## Implemented Backend SDK API

Use these exports from `@flowlens/node`:

- `flowlens(config)` — Express-style middleware
- `flowlensFastify(config)` — Fastify plugin
- `wrapHandler(handler, config)` — generic `node:http` wrapper

There is no `createFlowLens()` API in the current implementation.

## Live Documentation

- Architecture and app behavior: `readme_dev.md`
- SDK usage and package details: `readme_package.md`
- Quick start and overview: `README.md`

## Historical Notes

The original plan discussed possible future additions (Koa/Nest/OTel bridges).  
Those are still potential future work but are not part of the current shipped API.
