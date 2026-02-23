import { WebContentsView } from 'electron'
import { join } from 'path'
import { getMainWindow } from './window-manager'
import { TraceCorrelationEngine } from './trace-correlation-engine'
import { clearSourceCache } from './source-fetcher'

let targetView: WebContentsView | null = null
let splitRatio = 0.55

function getInstrumentationScript(): string {
  return `
(function() {
  if (window.__flowlens_instrumented) return;
  window.__flowlens_instrumented = true;

  const bridge = window.__flowlens_bridge;
  if (!bridge) { console.warn('[FlowLens] No bridge found'); return; }

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  let currentTraceId = uid();

  function send(type, data, traceId) {
    var stack = null;
    try { stack = new Error().stack || null; } catch(e) {}
    bridge.sendEvent({
      id: uid(),
      traceId: traceId || currentTraceId,
      type: type,
      timestamp: Date.now(),
      url: location.href,
      data: data,
      sourceStack: stack
    });
  }

  // DOM events
  var domEvents = ['click', 'input', 'submit', 'change', 'focus', 'blur'];
  domEvents.forEach(function(evtType) {
    document.addEventListener(evtType, function(e) {
      if (evtType === 'click' || evtType === 'submit') {
        currentTraceId = uid();
      }
      var el = e.target;
      send('dom', {
        eventType: evtType,
        target: el ? (el.tagName || '') + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ').join('.') : '') : '',
        tagName: el ? el.tagName || '' : '',
        id: el ? el.id || undefined : undefined,
        className: el ? String(el.className || '') : '',
        textContent: el && el.textContent ? el.textContent.slice(0, 100) : undefined,
        value: el && el.value !== undefined ? String(el.value).slice(0, 100) : undefined
      });
    }, true);
  });

  // Fetch monkey-patch
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var reqId = uid();
    var method = (init && init.method) || 'GET';
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var traceId = currentTraceId;
    var start = Date.now();

    send('network-request', {
      requestId: reqId,
      method: method,
      url: url,
      body: init && init.body ? String(init.body).slice(0, 500) : undefined
    }, traceId);

    return origFetch.apply(this, arguments).then(function(res) {
      send('network-response', {
        requestId: reqId,
        method: method,
        url: url,
        status: res.status,
        statusText: res.statusText,
        duration: Date.now() - start
      }, traceId);
      return res;
    }).catch(function(err) {
      send('network-error', {
        requestId: reqId,
        method: method,
        url: url,
        error: err.message || String(err),
        duration: Date.now() - start
      }, traceId);
      throw err;
    });
  };

  // XHR monkey-patch
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__fl_method = method;
    this.__fl_url = String(url);
    this.__fl_reqId = uid();
    this.__fl_traceId = currentTraceId;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    var xhr = this;
    var start = Date.now();

    send('network-request', {
      requestId: xhr.__fl_reqId,
      method: xhr.__fl_method,
      url: xhr.__fl_url,
      body: body ? String(body).slice(0, 500) : undefined
    }, xhr.__fl_traceId);

    xhr.addEventListener('load', function() {
      send('network-response', {
        requestId: xhr.__fl_reqId,
        method: xhr.__fl_method,
        url: xhr.__fl_url,
        status: xhr.status,
        statusText: xhr.statusText,
        duration: Date.now() - start
      }, xhr.__fl_traceId);
    });

    xhr.addEventListener('error', function() {
      send('network-error', {
        requestId: xhr.__fl_reqId,
        method: xhr.__fl_method,
        url: xhr.__fl_url,
        error: 'XHR error',
        duration: Date.now() - start
      }, xhr.__fl_traceId);
    });

    return origSend.apply(this, arguments);
  };

  // Console monkey-patch
  var levels = ['log', 'warn', 'error', 'info', 'debug'];
  levels.forEach(function(level) {
    var orig = console[level];
    console[level] = function() {
      var args = Array.prototype.slice.call(arguments).map(function(a) {
        try { return typeof a === 'string' ? a : JSON.stringify(a); }
        catch(e) { return String(a); }
      });
      send('console', { level: level, args: args });
      return orig.apply(console, arguments);
    };
  });

  // Error capture
  window.addEventListener('error', function(e) {
    send('error', {
      message: e.message || 'Unknown error',
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error && e.error.stack ? e.error.stack : undefined,
      type: 'error'
    });
  });

  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason || {};
    send('error', {
      message: reason.message || String(reason) || 'Unhandled rejection',
      stack: reason.stack || undefined,
      type: 'unhandledrejection'
    });
  });
})();
//# sourceURL=__flowlens_instrumentation__
`
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
