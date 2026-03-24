# Contributing to FlowLens

Thanks for your interest in contributing to FlowLens! This guide will help you get set up and submit your first PR.

## Development Setup

```bash
git clone https://github.com/amoreX/flowlens.git
cd flowlens
npm install
npm run dev
```

This builds the instrumentation bundle (`packages/web`) and starts the Electron app with hot reload. Changes to the renderer (React UI) are reflected instantly. Changes to the main process require a restart.

## Project Structure

```
src/
  main/           # Electron main process (trace engine, IPC, WS server)
  preload/        # IPC bridge between main and renderer
  renderer/src/   # React UI (timeline, source panel, console, inspector)
  shared/         # Shared TypeScript types
packages/
  web/            # Browser instrumentation bundle (injected into target pages)
  node/           # Backend SDK (@nihal/flowlens-node) for Express/Node.js
```

See `readme_dev.md` for the full architecture walkthrough.

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run typecheck` to verify types
4. Test manually by running `npm run dev` and loading a page (e.g. `http://localhost:3099`)
5. Open a pull request against `main`

## What to Work On

- Check the [Issues](https://github.com/amoreX/flowlens/issues) tab for open bugs and feature requests
- Issues labeled `good first issue` are a great starting point
- If you want to work on something not listed, open an issue first to discuss it

## Code Style

- TypeScript with strict mode
- Vanilla CSS with custom properties defined in `tokens.css` — no Tailwind, no CSS-in-JS
- System font stack for UI, JetBrains Mono for code
- Keep comments minimal — only where the logic isn't self-evident
- No unnecessary abstractions — simple and direct code is preferred

## Architecture Notes

- **Three Electron processes**: main (Node.js), renderer (React UI), target view (embedded browser)
- **IPC channels** are the communication layer — see `src/main/ipc-handlers.ts` and `src/preload/index.ts`
- **Instrumentation** is injected via `executeJavaScript()` — the bundle from `packages/web/dist/browser.global.js`
- **Trace correlation** happens via `X-FlowLens-Trace-Id` headers injected into every outgoing request

## Packages

If you're modifying the packages (`packages/web` or `packages/node`), rebuild them:

```bash
# Rebuild the browser instrumentation bundle
npm run build --workspace @nihal/flowlens-web

# Rebuild the Node.js SDK
npm run build --workspace @nihal/flowlens-node
```

## Reporting Issues

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS and Node.js version
- Electron version (shown in the app's About dialog or `package.json`)

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Make sure `npm run typecheck` passes
- Screenshots or GIFs are helpful for UI changes
