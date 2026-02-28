import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WebContentsView } from 'electron'
import { clearSourceCache } from './source-fetcher'
import { getMainWindow } from './window-manager'
import { TraceCorrelationEngine } from './trace-correlation-engine'

let targetView: WebContentsView | null = null
let splitRatio = 0.55
let instrumentationScriptCache: string | null = null

function resolveInstrumentationBundlePath(): string | null {
  const candidates = [
    join(process.cwd(), 'packages/web/dist/browser.global.js'),
    join(process.cwd(), 'packages/web/dist/browser.js'),
    join(process.cwd(), 'packages/web/dist/index.global.js'),
    join(__dirname, '../../packages/web/dist/browser.global.js'),
    join(__dirname, '../../packages/web/dist/browser.js'),
    join(__dirname, '../../packages/web/dist/index.global.js')
  ]

  for (const path of candidates) {
    if (existsSync(path)) return path
  }

  return null
}

function getInstrumentationScript(): string {
  if (instrumentationScriptCache) return instrumentationScriptCache

  const bundlePath = resolveInstrumentationBundlePath()
  if (!bundlePath) {
    instrumentationScriptCache = `console.warn('[FlowLens] @flowlens/web browser bundle not found. Run: npm run build --workspace @flowlens/web');`
    return instrumentationScriptCache
  }

  const bundle = readFileSync(bundlePath, 'utf8')
  instrumentationScriptCache = `${bundle}
;(() => {
  try {
    const sdk = window.FlowLensWeb
    if (!sdk || typeof sdk.init !== 'function') {
      console.warn('[FlowLens] FlowLensWeb global API not found after bundle injection')
      return
    }
    sdk.init({
      endpoint: 'ws://localhost:9230',
      patchDOM: true,
      patchFetch: true,
      patchXHR: true,
      patchConsole: true,
      captureErrors: true,
      detectReactState: true
    })
  } catch (err) {
    console.error('[FlowLens] Failed to initialize @flowlens/web instrumentation', err)
  }
})();
//# sourceURL=__flowlens_sdk__`

  return instrumentationScriptCache
}

export function createTargetView(
  url: string,
  traceEngine: TraceCorrelationEngine
): WebContentsView | null {
  const mainWindow = getMainWindow()
  if (!mainWindow) return null

  destroyTargetView()

  targetView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/target-preload.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.contentView.addChildView(targetView)
  updateTargetBounds()

  mainWindow.on('resize', updateTargetBounds)

  targetView.webContents.on('ipc-message', (_event, channel, ...args) => {
    if (channel === 'instrumentation:event') {
      const event = args[0]
      traceEngine.ingestEvent(event)
      mainWindow.webContents.send('trace:event-received', event)
    }
  })

  targetView.webContents.on('did-finish-load', () => {
    clearSourceCache()
    targetView?.webContents.executeJavaScript(getInstrumentationScript())
  })

  targetView.webContents.on('did-navigate-in-page', (_event, pageUrl) => {
    const navEvent = {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
      traceId: Date.now().toString(36) + '-nav-' + Math.random().toString(36).slice(2, 9),
      type: 'navigation' as const,
      timestamp: Date.now(),
      url: pageUrl,
      data: { url: pageUrl, type: 'spa-navigation' as const }
    }
    traceEngine.ingestEvent(navEvent)
    mainWindow.webContents.send('trace:event-received', navEvent)
  })

  targetView.webContents.loadURL(url)

  // Notify renderer that target is loaded
  mainWindow.webContents.send('target:loaded', url)

  return targetView
}

function updateTargetBounds(): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || !targetView) return
  const { width, height } = mainWindow.getContentBounds()
  const targetWidth = Math.floor(width * splitRatio)
  targetView.setBounds({ x: 0, y: 0, width: targetWidth, height })
}

export function setTargetSplitRatio(ratio: number): void {
  splitRatio = Math.max(0.2, Math.min(0.8, ratio))
  updateTargetBounds()
}

export function destroyTargetView(): void {
  const mainWindow = getMainWindow()
  if (targetView) {
    if (mainWindow) {
      mainWindow.contentView.removeChildView(targetView)
      mainWindow.removeAllListeners('resize')
    }
    targetView.webContents.close()
    targetView = null
  }
}

export function getTargetView(): WebContentsView | null {
  return targetView
}
