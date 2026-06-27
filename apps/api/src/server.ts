import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { resolveTenant } from './middleware/tenant.js'

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

await app.register(cors, { origin: true, credentials: true })
await app.register(helmet)
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }) // 10MB
await app.register(cookie)
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

// Global error handler
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  reply.code(error.statusCode ?? 500).send({ error: error.message })
})

// Public routes
await app.register(healthRoutes)

// Routes requiring tenant resolution
await app.register(async (tenantApp) => {
  tenantApp.addHook('preHandler', resolveTenant)
  await tenantApp.register(authRoutes)
})

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })

const shutdown = async () => { await app.close(); process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
