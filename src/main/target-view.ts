import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WebContentsView } from 'electron'
import { clearSourceCache } from './source-fetcher'
import { getMainWindow } from './window-manager'
import { TraceCorrelationEngine } from './trace-correlation-engine'
import type { DomEventData } from '../shared/types'

let targetView: WebContentsView | null = null
let splitRatio = 0.55
let instrumentationScriptCache: string | null = null
const WINDOW_DRAG_REGION_HEIGHT = 32
const TARGET_TOOLBAR_HEIGHT = 40
const TARGET_TOP_INSET = WINDOW_DRAG_REGION_HEIGHT + TARGET_TOOLBAR_HEIGHT

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

  targetView.webContents.on('did-navigate', (_event, pageUrl) => {
    mainWindow.webContents.send('target:loaded', pageUrl)
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
    mainWindow.webContents.send('target:loaded', pageUrl)
  })

  targetView.webContents.loadURL(url)

  return targetView
}

function updateTargetBounds(): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || !targetView) return
  const { width, height } = mainWindow.getContentBounds()
  const targetWidth = Math.floor(width * splitRatio)
  const targetHeight = Math.max(0, height - TARGET_TOP_INSET)
  targetView.setBounds({ x: 0, y: TARGET_TOP_INSET, width: targetWidth, height: targetHeight })
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

export function reloadTargetView(): { success: boolean; reason?: string } {
  if (!targetView) {
    return { success: false, reason: 'No target view is active' }
  }
  targetView.webContents.reload()
  return { success: true }
}

export interface TargetHighlightResult {
  success: boolean
  reason?: string
}

export async function highlightDomTarget(data: DomEventData): Promise<TargetHighlightResult> {
  if (!targetView) {
    return { success: false, reason: 'No embedded target is active (open a URL mode trace first)' }
  }
  if (targetView.webContents.isLoadingMainFrame()) {
    return { success: false, reason: 'Target page is still loading' }
  }

  const payload = JSON.stringify({
    tagName: data.tagName || '',
    id: data.id || '',
    className: data.className || '',
    textContent: data.textContent || '',
    target: data.target || ''
  })

  const script = `(() => {
  const data = ${payload};
  const normalize = (v) => (typeof v === 'string' ? v.trim() : '');
  const tag = normalize(data.tagName).toLowerCase();
  const id = normalize(data.id);
  const className = normalize(data.className);
  const textContent = normalize(data.textContent);
  const target = normalize(data.target);

  const makeClassSelector = (value) => value
    .split(/\\s+/)
    .filter(Boolean)
    .map((c) => '.' + c.replace(/[^a-zA-Z0-9_-]/g, ''))
    .join('');

  const candidates = [];
  const seen = new Set();
  const push = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    candidates.push(el);
  };

  if (id) {
    push(document.getElementById(id));
  }

  if (tag && className) {
    try {
      const cls = makeClassSelector(className);
      if (cls) {
        document.querySelectorAll(tag + cls).forEach(push);
      }
    } catch {}
  }

  if (target) {
    try {
      if (/^[a-zA-Z][a-zA-Z0-9:_-]*(#[a-zA-Z0-9:_-]+)?(\\.[a-zA-Z0-9:_-]+)*$/.test(target)) {
        const selector = target.replace(/(^|\\s)\\./g, '$1.');
        document.querySelectorAll(selector).forEach(push);
      }
    } catch {}
  }

  if (tag) {
    document.querySelectorAll(tag).forEach(push);
  }

  let picked = null;
  if (textContent) {
    const lower = textContent.toLowerCase();
    picked = candidates.find((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      return text === lower || (text && text.includes(lower));
    }) || null;
  }

  if (!picked) {
    picked = candidates.find((el) => el.getClientRects && el.getClientRects().length > 0) || candidates[0] || null;
  }

  if (!picked) {
    return { success: false, reason: 'Element not found in currently rendered page' };
  }

  const styleId = '__flowlens_target_highlight_style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = \`
      .__flowlens_target_highlight {
        outline: 3px solid #00e5ff !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(0, 229, 255, 0.2), 0 0 18px rgba(0, 229, 255, 0.45) !important;
        border-radius: 6px !important;
        transition: outline-color 180ms ease, box-shadow 180ms ease !important;
      }
    \`;
    document.head.appendChild(style);
  }

  const w = window;
  if (typeof w.__flowlens_clear_target_highlight === 'function') {
    w.__flowlens_clear_target_highlight();
  }

  picked.classList.add('__flowlens_target_highlight');
  picked.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });

  const clear = () => {
    try {
      picked.classList.remove('__flowlens_target_highlight');
    } catch {}
    if (w.__flowlens_clear_target_highlight === clear) {
      w.__flowlens_clear_target_highlight = null;
    }
  };

  w.__flowlens_clear_target_highlight = clear;
  setTimeout(clear, 2200);
  return { success: true };
})()`

  try {
    const result = await targetView.webContents.executeJavaScript(script)
    const res = result as TargetHighlightResult | undefined
    if (res?.success) return { success: true }
    return { success: false, reason: res?.reason || 'Highlight script did not find a matching element' }
  } catch {
    return { success: false, reason: 'Cannot access target page context (possibly navigated or restricted)' }
  }
}
