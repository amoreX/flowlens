# Open-Sourcing FlowLens — Complete Checklist

Everything you need to do before making the repo public and releasing FlowLens as an open-source project. This covers licensing, cleanup, CI/CD, npm publishing, GitHub Releases, and community docs.

---

## 1. Licensing

You already have `"license": "MIT"` in package.json, but you're **missing the actual LICENSE file**. Without it, the license declaration is legally meaningless.

### What to do

Create a `LICENSE` file in the repo root with the MIT license text:

```
MIT License

Copyright (c) 2025 Nihal (amoreX)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Why MIT

MIT is the most permissive common license. Anyone can use, modify, and distribute your code (including commercially) as long as they include the copyright notice. It's what React, Electron, Vite, and most of the tools you depend on use. No reason to pick anything else unless you want copyleft (GPL) or have specific concerns.

---

## 2. Clean Up Before Going Public

### Things to check in git history

- **No secrets** — search your git history for API keys, tokens, passwords, `.env` files. Run: `git log --all --diff-filter=A -- '*.env' '.env*'` to check if any env files were ever committed.
- **No hardcoded paths** — your code has `file:/Users/nihal/code/flowlens/packages/...` in test app package.json files. Those are in a separate repo (`test_flowlens`), so they won't be in the FlowLens repo. But double-check nothing in the FlowLens repo references your home directory.
- **No personal data** — check for email addresses, names, or other personal info you don't want public (git author info is fine since GitHub shows it anyway).

### Files to add/update

| File | Status | What to do |
|------|--------|-----------|
| `LICENSE` | Missing | Create with MIT text (see above) |
| `CONTRIBUTING.md` | Missing | Create (see section 3) |
| `.gitignore` | Exists but minimal | Add `packages/*/dist`, `.env`, `.env.*`, `*.dmg`, `*.exe`, `*.AppImage` |
| `CLAUDE.md` | Exists | This is your internal dev doc. Decide: keep it (it's useful for AI contributors) or remove it. I'd keep it. |
| `working.md` | Exists | This is your personal reference. Remove it before going public — the info is already in `readme_dev.md` and `CLAUDE.md`. Or rename it to something like `ARCHITECTURE.md` and clean it up. |
| `package_plan.md` | Exists | Historical planning doc. Delete before going public. |
| `readme_package.md` | Exists | Good reference. Keep. |
| `readme_dev.md` | Exists | Good reference. Keep. |

### Package naming

Your npm package is currently `@nihal/flowlens-node`. For open source, consider:

- **Claim the `@flowlens` npm org** — then publish as `@flowlens/node`. Cleaner and not tied to your personal npm scope.
- **Or use unscoped** — `flowlens-node`. Simpler but less organized.

To claim `@flowlens` on npm: go to npmjs.com, sign in, click your avatar → Add Organization → type "flowlens". It's free.

Update `packages/node/package.json` with the final name before publishing.

---

## 3. CONTRIBUTING.md

Create this file so people know how to contribute:

```markdown
# Contributing to FlowLens

## Development Setup

```bash
git clone https://github.com/amoreX/flowlens.git
cd flowlens
npm install
npm run dev
```

This builds the instrumentation bundle and starts the Electron app with hot reload.

## Project Structure

See `readme_dev.md` for the full architecture breakdown.

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run typecheck` to verify types
4. Test manually by running `npm run dev` and loading a page
5. Open a pull request

## Code Style

- TypeScript strict mode
- Vanilla CSS with custom properties (no Tailwind, no CSS-in-JS)
- JetBrains Mono for code, DM Serif Display for headings
- No comments that just narrate what code does

## Reporting Issues

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS and Node.js version
```

---

## 4. .gitignore Updates

Your current `.gitignore` is minimal. Add these before going public:

```
node_modules
dist
out
.DS_Store
*.log

# Environment files
.env
.env.*

# Package build artifacts
packages/*/dist

# Electron builder output
*.dmg
*.exe
*.AppImage
*.deb
*.rpm
*.snap

# IDE
.vscode/settings.json
.idea/
*.swp
*.swo

# OS
Thumbs.db
```

---

## 5. CI/CD Pipelines (GitHub Actions)

You need three workflows:

### 5.1 CI — runs on every pull request

File: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:web-sdk
      - run: npm run --workspace @flowlens/node build
      - run: npm run typecheck
```

This catches broken types and build failures on every PR. No tests yet (you don't have any), but this is the place to add them later.

### 5.2 Desktop App Release — builds and uploads binaries

File: `.github/workflows/release.yml`

Triggered when you create a GitHub Release (e.g., tag `v0.1.0`).

```yaml
name: Release
on:
  release:
    types: [published]

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Build Electron app
        run: npx electron-builder --publish never
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.os }}
          path: |
            dist/*.dmg
            dist/*.exe
            dist/*.AppImage
            dist/*.deb
```

After the workflow runs, download the artifacts and attach them to the GitHub Release. Or use `--publish always` with a `GH_TOKEN` to auto-upload.

**Note:** macOS code signing and notarization require an Apple Developer account ($99/yr). Without it, users get a "damaged app" warning and have to right-click → Open. You can skip this initially and add it later. Your `electron-builder.yml` already has `notarize: false`.

### 5.3 npm Publish — publishes `@flowlens/node`

File: `.github/workflows/npm-publish.yml`

Triggered when you create a GitHub Release (same trigger as desktop, runs in parallel).

```yaml
name: Publish npm
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run --workspace @flowlens/node build
      - run: npm publish --workspace @flowlens/node --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Setup required:**
1. Create an npm account at npmjs.com (if you don't have one)
2. Generate an access token: npmjs.com → Access Tokens → Generate New Token (Classic, Automation type)
3. Add it as a GitHub repo secret: Settings → Secrets → Actions → `NPM_TOKEN`

---

## 6. npm Publishing Checklist

Before the first `npm publish`:

1. **Claim the scope** — go to npmjs.com and create the `@flowlens` org (or use `@nihal`)
2. **Update the package name** — in `packages/node/package.json`, change `@nihal/flowlens-node` to `@flowlens/node` (or whatever scope you claimed)
3. **Update all references** — search the codebase for `@nihal/flowlens-node` and update to the new name (README.md, CLAUDE.md, readme_dev.md, readme_package.md, stack-parser.ts filter)
4. **Set the version** — start at `0.1.0` (you already have this)
5. **Verify `files` field** — `packages/node/package.json` has `"files": ["dist"]` which is correct (only publishes the built output, not source)
6. **Dry run** — `npm publish --workspace @flowlens/node --access public --dry-run` to see what would be published without actually doing it
7. **Publish** — `npm publish --workspace @flowlens/node --access public`

### Versioning going forward

Use semantic versioning:
- `0.x.y` — pre-1.0, breaking changes are expected
- Bump patch (`0.1.1`) for bug fixes
- Bump minor (`0.2.0`) for new features
- Bump major (`1.0.0`) when the API is stable

To bump: `npm version patch --workspace @flowlens/node` (or `minor`/`major`), then push the tag.

---

## 7. GitHub Repository Setup

Before making the repo public:

### Repository settings

- **Description**: "Desktop debugging tool for tracing frontend and backend behavior in one timeline"
- **Topics**: `electron`, `debugging`, `tracing`, `developer-tools`, `react`, `nodejs`, `typescript`
- **Website**: (optional — your personal site or a landing page)
- **Social preview image**: Create a screenshot or banner showing FlowLens in action (1280x640px recommended)

### Branch protection (optional but recommended)

Settings → Branches → Add rule for `main`:
- Require pull request reviews before merging
- Require status checks (the CI workflow) to pass

### Releases

When you're ready to release:

1. `git tag v0.1.0`
2. `git push origin v0.1.0`
3. Go to GitHub → Releases → Draft a new release
4. Select the tag, write release notes, publish
5. CI builds the app and publishes the npm package automatically

---

## 8. README Polish for Open Source

Your current README is good but could use a few additions for open source:

### Add a screenshot/GIF

A single screenshot or GIF of FlowLens in action is worth more than any amount of text. Capture the split view showing:
- A test app on the left
- The timeline with traces on the right
- Some events expanded

Put it right after the title.

### Add badges

At the top of README.md:

```markdown
![CI](https://github.com/amoreX/flowlens/actions/workflows/ci.yml/badge.svg)
[![npm](https://img.shields.io/npm/v/@flowlens/node)](https://www.npmjs.com/package/@flowlens/node)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
```

### Add a "Download" section

```markdown
## Download

Download the latest release for your platform:

- [macOS (.dmg)](https://github.com/amoreX/flowlens/releases/latest)
- [Windows (.exe)](https://github.com/amoreX/flowlens/releases/latest)
- [Linux (.AppImage)](https://github.com/amoreX/flowlens/releases/latest)

Or build from source: `npm install && npm run build`
```

---

## 9. Things You DON'T Need Right Now

Don't over-engineer the open-source launch. Skip these until you actually need them:

- **Changelog** — not needed until you have multiple releases
- **Code of Conduct** — add when you have active contributors
- **Issue templates** — add when you're getting enough issues that you need structure
- **Automated tests** — nice to have but your project works by manual testing for now
- **Docker** — not relevant for an Electron app
- **Dependabot** — GitHub enables it by default, but it's noisy. You can turn it off and update deps manually
- **Code coverage** — meaningless without tests
- **Monorepo tooling (Turborepo, Nx)** — npm workspaces is enough for 2 packages

---

## 10. Launch Order

Do this in order:

1. **Create the `LICENSE` file**
2. **Create `CONTRIBUTING.md`**
3. **Update `.gitignore`**
4. **Delete `package_plan.md` and `opensourceguide.md`** (this file — it's for your eyes only)
5. **Decide on `working.md`** — delete or rename to `ARCHITECTURE.md`
6. **Claim `@flowlens` on npm** (or decide on the scope)
7. **Update package names** if changing from `@nihal/flowlens-node`
8. **Add screenshot to README**
9. **Create the three GitHub Actions workflows** (ci.yml, release.yml, npm-publish.yml)
10. **Add the `NPM_TOKEN` secret** to GitHub
11. **Push everything to `main`**
12. **Make the repo public** — GitHub Settings → Danger Zone → Change visibility
13. **Create your first Release** — tag `v0.1.0`, write release notes
14. **Verify** — CI runs, npm package publishes, app builds upload

---

## Quick Reference — Files to Create

| File | Purpose |
|------|---------|
| `LICENSE` | MIT license text |
| `CONTRIBUTING.md` | How to set up dev environment and submit PRs |
| `.github/workflows/ci.yml` | Typecheck + build on every PR |
| `.github/workflows/release.yml` | Build Electron app on release |
| `.github/workflows/npm-publish.yml` | Publish `@flowlens/node` to npm on release |

## Quick Reference — Files to Delete

| File | Reason |
|------|--------|
| `package_plan.md` | Historical planning doc, not relevant for users |
| `opensourceguide.md` | This file — internal checklist |
| `working.md` | Personal reference (or rename to `ARCHITECTURE.md`) |
