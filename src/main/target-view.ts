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
  let eventSeq = 0;

  function send(type, data, traceId, extraStack) {
    var stack = null;
    try { stack = new Error().stack || null; } catch(e) {}
    if (extraStack) {
      stack = (stack || '') + '\\n' + extraStack;
    }
    bridge.sendEvent({
      id: uid(),
      traceId: traceId || currentTraceId,
      type: type,
      timestamp: Date.now(),
      seq: ++eventSeq,
      url: location.href,
      data: data,
      sourceStack: stack
    });
  }

  // Extract React source info from fiber tree using _debugStack (React 19)
  // or _debugSource (React 18) as fallback
  function getReactComponentStack(element) {
    if (!element) return '';
    try {
      var fiberKey = null;
      var keys = Object.keys(element);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('__reactFiber$') === 0) {
          fiberKey = keys[i];
          break;
        }
      }
      if (!fiberKey) return '';

      var collectedStacks = [];
      var seen = {};
      var f = element[fiberKey];
      var count = 0;

      while (f && count < 15) {
        count++;

        // React 19: _debugStack is an Error object whose .stack contains
        // the V8 call stack from where the JSX element was created.
        // The user source line (e.g. App.tsx:224) is in that stack.
        if (f._debugStack && f._debugStack.stack) {
          var stackStr = f._debugStack.stack;
          var stackLines = stackStr.split('\\n');
          for (var j = 0; j < stackLines.length; j++) {
            var line = stackLines[j];
            // Skip non-frame lines and React/framework internals
            if (line.indexOf('    at ') !== 0) continue;
            if (line.indexOf('node_modules') >= 0) continue;
            if (line.indexOf('.vite/deps') >= 0) continue;
            if (line.indexOf('__flowlens') >= 0) continue;
            if (line.indexOf('react-stack-top-frame') >= 0) continue;
            // Deduplicate
            if (!seen[line]) {
              seen[line] = true;
              collectedStacks.push(line);
            }
          }
        }

        // React 18 fallback: _debugSource has fileName/lineNumber directly
        if (f._debugSource) {
          var fileName = f._debugSource.fileName;
          if (fileName.indexOf('://') === -1) {
            var srcIdx = fileName.indexOf('/src/');
            if (srcIdx >= 0) fileName = location.origin + fileName.slice(srcIdx);
            else if (fileName.charAt(0) === '/') fileName = location.origin + fileName;
            else fileName = location.origin + '/' + fileName;
          }
          var name = 'Component';
          if (f.type) {
            if (typeof f.type === 'string') name = '<' + f.type + '>';
            else if (f.type.displayName || f.type.name) name = f.type.displayName || f.type.name;
          }
          var frame = '    at ' + name + ' (' + fileName + ':' + f._debugSource.lineNumber + ':' + (f._debugSource.columnNumber || 1) + ')';
          if (!seen[frame]) {
            seen[frame] = true;
            collectedStacks.push(frame);
          }
        }

        f = f.return;
      }

      return collectedStacks.join('\\n');
    } catch(e2) {
      return '';
    }
  }

  // State change detection — walks the React fiber tree after DOM events
  // to find useState hooks whose value changed, emitting state-change events
  function getFiberRootFromElement(element) {
    if (!element) return null;
    var el = element;
    while (el) {
      var keys = Object.keys(el);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('__reactFiber$') === 0) {
          var fiber = el[keys[i]];
          var root = fiber;
          while (root && root.return) root = root.return;
          if (root && root.stateNode && root.stateNode.current) return root.stateNode;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  function findFiberRoot(element) {
    var root = getFiberRootFromElement(element);
    if (root) return root;

    // Fallback: find first React-owned element in document.
    var body = document.body;
    if (!body || !body.querySelectorAll) return null;
    var nodes = body.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      root = getFiberRootFromElement(nodes[i]);
      if (root) return root;
    }
    return null;
  }

  function getFiberSourceStack(f) {
    if (f._debugStack && f._debugStack.stack) {
      return f._debugStack.stack;
    }
    if (f._debugSource) {
      var fileName = f._debugSource.fileName;
      if (fileName.indexOf('://') === -1) {
        var srcIdx = fileName.indexOf('/src/');
        if (srcIdx >= 0) fileName = location.origin + fileName.slice(srcIdx);
        else if (fileName.charAt(0) === '/') fileName = location.origin + fileName;
        else fileName = location.origin + '/' + fileName;
      }
      var name = 'Component';
      if (f.type) {
        if (typeof f.type === 'string') name = '<' + f.type + '>';
        else if (f.type.displayName || f.type.name) name = f.type.displayName || f.type.name;
      }
      return '    at ' + name + ' (' + fileName + ':' + f._debugSource.lineNumber + ':' + (f._debugSource.columnNumber || 1) + ')';
    }
    return '';
  }

  var emittedStateSignatures = {};

  function scheduleStateDetection(traceId, element) {
    var target = element || document.body;
    var delays = [0, 40, 140];
    for (var i = 0; i < delays.length; i++) {
      (function(delay) {
        setTimeout(function() { detectStateChanges(target, traceId); }, delay);
      })(delays[i]);
    }
  }

  function detectStateChanges(element, traceId) {
    try {
      var fiberRoot = findFiberRoot(element);
      if (!fiberRoot) return;

      var seen = {};

      function walkFiber(f) {
        if (!f) return;

        // Only check function components with hooks and a previous render
        if (typeof f.type === 'function' && f.memoizedState !== null && f.alternate !== null) {
          var componentName = f.type.displayName || f.type.name || 'Anonymous';

          // Walk the hooks linked list
          var currentHook = f.memoizedState;
          var alternateHook = f.alternate.memoizedState;
          var hookIdx = 0;

          while (currentHook && alternateHook) {
            // Detect useState/useReducer hooks by the presence of queue.dispatch
            if (currentHook.queue && typeof currentHook.queue.dispatch === 'function') {
              var curVal = currentHook.memoizedState;
              var prevVal = alternateHook.memoizedState;

              if (!Object.is(curVal, prevVal)) {
                var key = componentName + ':' + hookIdx;
                if (!seen[key]) {
                  seen[key] = true;

                  var sourceStack = getFiberSourceStack(f);

                  var prevStr, curStr;
                  try { prevStr = JSON.stringify(prevVal); } catch(e) { prevStr = String(prevVal); }
                  try { curStr = JSON.stringify(curVal); } catch(e) { curStr = String(curVal); }

                  var emittedKey = traceId + ':' + key;
                  var signature = prevStr + '->' + curStr;
                  if (emittedStateSignatures[emittedKey] === signature) {
                    // Skip duplicate emission when the same change is detected repeatedly.
                    continue;
                  }
                  emittedStateSignatures[emittedKey] = signature;

                  send('state-change', {
                    component: componentName,
                    hookIndex: hookIdx,
                    prevValue: prevStr,
                    value: curStr
                  }, traceId, sourceStack);
                }
              }
            }

            hookIdx++;
            currentHook = currentHook.next;
            alternateHook = alternateHook.next;
          }
        }

        walkFiber(f.child);
        walkFiber(f.sibling);
      }

      walkFiber(fiberRoot.current);
    } catch (err) {
      // State detection is best-effort — silently fail
    }
  }

  // DOM events
  var domEvents = ['click', 'input', 'submit', 'change', 'focus', 'blur'];
  domEvents.forEach(function(evtType) {
    document.addEventListener(evtType, function(e) {
      if (evtType === 'click' || evtType === 'submit') {
        currentTraceId = uid();
      }
      var el = e.target;
      var traceId = currentTraceId;
      var componentStack = getReactComponentStack(el);
      send('dom', {
        eventType: evtType,
        target: el ? (el.tagName || '') + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ').join('.') : '') : '',
        tagName: el ? el.tagName || '' : '',
        id: el ? el.id || undefined : undefined,
        className: el ? String(el.className || '') : '',
        textContent: el && el.textContent ? el.textContent.slice(0, 100) : undefined,
        value: el && el.value !== undefined ? String(el.value).slice(0, 100) : undefined
      }, traceId, componentStack);

      // After React processes the event and re-renders, detect state changes
      if (evtType === 'click' || evtType === 'submit' || evtType === 'change' || evtType === 'input') {
        scheduleStateDetection(traceId, el);
      }
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

    // Inject trace header for backend correlation
    if (!init) init = {};
    if (!init.headers) init.headers = {};
    if (init.headers instanceof Headers) {
      init.headers.set('X-FlowLens-Trace-Id', traceId);
    } else if (Array.isArray(init.headers)) {
      init.headers.push(['X-FlowLens-Trace-Id', traceId]);
    } else {
      init.headers['X-FlowLens-Trace-Id'] = traceId;
    }

    send('network-request', {
      requestId: reqId,
      method: method,
      url: url,
      body: init && init.body ? String(init.body).slice(0, 500) : undefined
    }, traceId);

    return origFetch.call(this, input, init).then(function(res) {
      send('network-response', {
        requestId: reqId,
        method: method,
        url: url,
        status: res.status,
        statusText: res.statusText,
        duration: Date.now() - start
      }, traceId);
      scheduleStateDetection(traceId, document.body);
      return res;
    }).catch(function(err) {
      send('network-error', {
        requestId: reqId,
        method: method,
        url: url,
        error: err.message || String(err),
        duration: Date.now() - start
      }, traceId);
      scheduleStateDetection(traceId, document.body);
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

    // Inject trace header for backend correlation
    try { xhr.setRequestHeader('X-FlowLens-Trace-Id', xhr.__fl_traceId); } catch(e) {}

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
      scheduleStateDetection(xhr.__fl_traceId, document.body);
    });

    xhr.addEventListener('error', function() {
      send('network-error', {
        requestId: xhr.__fl_reqId,
        method: xhr.__fl_method,
        url: xhr.__fl_url,
        error: 'XHR error',
        duration: Date.now() - start
      }, xhr.__fl_traceId);
      scheduleStateDetection(xhr.__fl_traceId, document.body);
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
      scheduleStateDetection(currentTraceId, document.body);
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
