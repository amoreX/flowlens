import type { FlowLensNodeConfig } from '../types'
import { sendSpan } from '../sender'
import { captureStack } from '../stack-capture'

/**
 * Creates a Fastify plugin for FlowLens tracing.
 * Requires `fastify-plugin` as a peer dependency.
 *
 * ```ts
 * import { flowlensFastify } from '@flowlens/node'
 * app.register(flowlensFastify({ serviceName: 'my-api' }))
 * ```
 */
export function createFastifyPlugin(config: FlowLensNodeConfig) {
  const collectorUrl = config.collectorUrl || 'http://localhost:9229'
  const headerName = config.headerName || 'x-flowlens-trace-id'
  const serviceName = config.serviceName

  // Dynamic import to keep fastify-plugin optional
  const plugin = async (fastify: {
    addHook: (name: string, handler: (...args: unknown[]) => void) => void
  }): Promise<void> => {
    fastify.addHook(
      'onRequest',
      (
        request: { headers: Record<string, string | string[] | undefined> } & Record<string, unknown>,
        _reply: unknown,
        done: () => void
      ) => {
        if (config.enabled === false) {
          done()
          return
        }
        const traceId = request.headers[headerName] as string | undefined
        if (traceId) {
          ;(request as Record<string, unknown>).__flowlens_traceId = traceId
          ;(request as Record<string, unknown>).__flowlens_start = Date.now()
          ;(request as Record<string, unknown>).__flowlens_stack = captureStack()

          const reply = _reply as Record<string, unknown>
          const origSend = (reply as { send?: (...a: unknown[]) => unknown }).send
          if (typeof origSend === 'function') {
            ;(reply as { send: (...a: unknown[]) => unknown }).send = function (
              ...args: unknown[]
            ) {
              ;(request as Record<string, unknown>).__flowlens_responseStack = captureStack()
              ;(reply as { send: (...a: unknown[]) => unknown }).send = origSend.bind(reply)
              return origSend.apply(reply, args)
            }
          }
        }
        done()
      }
    )

    fastify.addHook(
      'onResponse',
      (
        request: Record<string, unknown> & {
          method?: string
          routeOptions?: { url?: string }
          url?: string
        },
        reply: { statusCode: number },
        done: () => void
      ) => {
        const traceId = request.__flowlens_traceId as string | undefined
        if (!traceId) {
          done()
          return
        }

        const start = request.__flowlens_start as number
        const duration = Date.now() - start
        const route =
          (request.routeOptions as { url?: string })?.url || (request.url as string) || '/'
        const method = (request.method as string) || 'GET'

        sendSpan(collectorUrl, {
          traceId,
          route,
          method,
          statusCode: reply.statusCode,
          duration,
          serviceName,
          timestamp: Date.now(),
          handlerStack: request.__flowlens_stack as string | undefined,
          responseStack: request.__flowlens_responseStack as string | undefined
        })

        done()
      }
    )
  }

  // Try to wrap with fastify-plugin for proper encapsulation
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fp = require('fastify-plugin')
    return fp(plugin, { name: '@flowlens/node' })
  } catch {
    return plugin
  }
}
