import type { FlowLensNodeConfig, ExpressMiddleware } from './types'
import { createExpressMiddleware } from './middleware/express'
import { createFastifyPlugin } from './middleware/fastify'
import { wrapHandler } from './middleware/generic'

export type { FlowLensNodeConfig, ExpressMiddleware, SpanPayload } from './types'

/**
 * Express middleware for FlowLens tracing.
 *
 * ```ts
 * import { flowlens } from '@nihal/flowlens-node'
 * app.use(flowlens({ serviceName: 'my-api' }))
 * ```
 */
export function flowlens(config: FlowLensNodeConfig): ExpressMiddleware {
  return createExpressMiddleware(config)
}

/**
 * Fastify plugin for FlowLens tracing.
 * Requires `fastify-plugin` as a peer dependency.
 *
 * ```ts
 * import { flowlensFastify } from '@nihal/flowlens-node'
 * app.register(flowlensFastify({ serviceName: 'my-api' }))
 * ```
 */
export function flowlensFastify(config: FlowLensNodeConfig) {
  return createFastifyPlugin(config)
}

/**
 * Wrap a raw Node.js HTTP handler with FlowLens tracing.
 *
 * ```ts
 * import { wrapHandler } from '@nihal/flowlens-node'
 * const traced = wrapHandler(handler, { serviceName: 'my-api' })
 * http.createServer(traced)
 * ```
 */
export { wrapHandler }
