# Final Steps to Open Source FlowLens

Everything you need to do to go from private repo to public release.

---

## 1. Secrets & Accounts Setup

### npm Token
1. Log into [npmjs.com](https://npmjs.com)
2. Go to Access Tokens → Generate New Token → Classic → **Automation**
3. Copy the token

### GitHub Secrets
1. Go to your repo → Settings → Secrets and variables → Actions
2. Add secret: `NPM_TOKEN` → paste the npm token from above
3. `GITHUB_TOKEN` is already available automatically in every workflow

### Blacksmith
1. Go to [useblacksmith.com](https://useblacksmith.com) and install the GitHub App on the `flowlens` repo
2. That's it — the `blacksmith-*` runner labels will work in your workflows

---

## 2. CI/CD Workflows to Create

### 2.1 CI — Every PR and push to main

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
    runs-on: blacksmith-2vcpu-ubuntu-2204
    steps:
      - uses: actions/checkout@v4
      - uses: useblacksmith/setup-node@v5
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:web-sdk
      - run: npm run typecheck
```

### 2.2 App Release — Electron binaries for all platforms

File: `.github/workflows/release.yml`

Triggered when you publish a GitHub Release.

```yaml
name: Release
on:
  release:
    types: [published]

jobs:
  build-linux:
    runs-on: blacksmith-4vcpu-ubuntu-2204
    steps:
      - uses: actions/checkout@v4
      - uses: useblacksmith/setup-node@v5
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx electron-builder --linux
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: linux
          path: dist/*.AppImage

  build-mac:
    runs-on: blacksmith-macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: useblacksmith/setup-node@v5
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx electron-builder --mac
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: mac
          path: dist/*.dmg

  build-windows:
    runs-on: blacksmith-4vcpu-ubuntu-2204
    steps:
      - uses: actions/checkout@v4
      - uses: useblacksmith/setup-node@v5
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: sudo apt-get install -y wine64
      - run: npm run build
      - run: npx electron-builder --win --x64
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: windows
          path: dist/*.exe

  upload:
    needs: [build-linux, build-mac, build-windows]
    runs-on: blacksmith-2vcpu-ubuntu-2204
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          merge-multiple: true
          path: artifacts
      - uses: softprops/action-gh-release@v2
        with:
          files: artifacts/*
```

### 2.3 SDK Publish — npm package

File: `.github/workflows/npm-publish.yml`

Triggered in parallel with the app release.

```yaml
name: Publish SDK
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: blacksmith-2vcpu-ubuntu-2204
    steps:
      - uses: actions/checkout@v4
      - uses: useblacksmith/setup-node@v5
        with:
          node-version: 20
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build --workspace @nihal/flowlens-node
      - run: npm publish --workspace @nihal/flowlens-node --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 3. How to Cut a Release

```bash
# 1. Bump version in root package.json
# 2. If SDK changed, also bump packages/node/package.json
# 3. Commit
git add package.json packages/node/package.json
git commit -m "v0.1.0"

# 4. Tag
git tag v0.1.0

# 5. Push
git push origin main --tags

# 6. Go to GitHub → Releases → Draft a new release
#    - Select tag: v0.1.0
#    - Title: v0.1.0
#    - Write release notes (what changed)
#    - Hit "Publish release"
```

Publishing the release triggers both workflows in parallel:
- **release.yml** builds .dmg, .exe, .AppImage and attaches them to the release
- **npm-publish.yml** publishes `@nihal/flowlens-node` to npm

---

## 4. npm Package Scope Decision

Current name: `@nihal/flowlens-node`

Options:
- **Keep `@nihal/flowlens-node`** — simplest, no changes needed, tied to your personal npm scope
- **Claim `@flowlens` org on npm** → rename to `@flowlens/node` — cleaner, project-scoped, not personal. Go to npmjs.com → Add Organization → type "flowlens" (free)

If you rename, update these files:
- `packages/node/package.json` (name field)
- `packages/web/package.json` (if it references the node package)
- `package.json` (workspace build script)
- `CLAUDE.md`, `readme_dev.md`, `readme_package.md` (docs)
- `src/renderer/src/utils/stack-parser.ts` (filter list)
- All 3 GitHub Actions workflow files (workspace name)

---

## 5. Before Making the Repo Public

### Checklist

- [ ] `LICENSE` file exists (done — MIT)
- [ ] `CONTRIBUTING.md` exists (done)
- [ ] No secrets in git history — run: `git log --all --diff-filter=A -- '*.env' '.env*'`
- [ ] No hardcoded personal paths in source code
- [ ] `working.md` deleted (done)
- [ ] `opensourceguide.md` deleted (done)
- [ ] `.github/workflows/ci.yml` created
- [ ] `.github/workflows/release.yml` created
- [ ] `.github/workflows/npm-publish.yml` created
- [ ] Blacksmith GitHub App installed
- [ ] `NPM_TOKEN` secret added to GitHub
- [ ] README has a screenshot or GIF of the app in action
- [ ] Decide on npm package scope (`@nihal` vs `@flowlens`)

### GitHub Repo Settings

After making public, configure:
- **Description**: "Desktop debugging tool that traces frontend and backend execution in one timeline"
- **Topics**: `electron`, `debugging`, `tracing`, `developer-tools`, `react`, `nodejs`, `typescript`
- **Branch protection on `main`** (optional): require PR reviews, require CI to pass

---

## 6. Platform Notes

### macOS Code Signing
Without an Apple Developer certificate ($99/year), macOS users see a "damaged app" warning. They can bypass it:
- Right-click the app → Open → Open anyway
- Or run: `xattr -cr /Applications/FlowLens.app`

You can add code signing + notarization later. Your `electron-builder.yml` already has `notarize: false`.

### Windows Cross-Compilation
The release workflow builds Windows binaries from Linux using Wine. This works for most Electron apps. If you hit issues, swap `build-windows` to use `windows-latest` (GitHub hosted runner — Blacksmith doesn't have Windows runners yet).

### Linux
AppImage is the most universal format. No signing needed.

---

## 7. Post-Launch

Things to add later when you actually need them (not now):
- **Changelog** — after 2-3 releases
- **Issue templates** — when you start getting lots of issues
- **Code of Conduct** — when you have active contributors
- **Automated tests** — when the codebase grows
- **Dependabot** — GitHub enables it by default, can be noisy
- **macOS code signing** — when you want a smooth install experience

---

## 8. Quick Launch Order

1. Create the 3 workflow files in `.github/workflows/`
2. Install Blacksmith GitHub App
3. Add `NPM_TOKEN` to GitHub secrets
4. Add a screenshot to README
5. Commit everything, push to `main`
6. Make the repo public (Settings → Danger Zone → Change visibility)
7. Create first release: tag `v0.1.0`, publish on GitHub
8. Verify: CI runs, binaries upload, npm package publishes
