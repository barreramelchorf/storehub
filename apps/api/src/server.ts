import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { categoryRoutes } from './routes/categories.js'
import { productRoutes } from './routes/products.js'
import { saleRoutes } from './routes/sales.js'
import { analyticsRoutes } from './routes/analytics.js'
import { documentRoutes } from './routes/documents.js'
import { uploadRoutes } from './routes/upload.js'
import { publicRoutes } from './routes/public.js'
import { resolveTenant } from './middleware/tenant.js'

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

await app.register(cors, { origin: true, credentials: true })
await app.register(helmet)
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
await app.register(cookie)
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  reply.code(error.statusCode ?? 500).send({ error: error.message })
})

// Public routes (no tenant needed)
await app.register(healthRoutes)

// All tenant-scoped routes
await app.register(async (tenantApp) => {
  tenantApp.addHook('preHandler', resolveTenant)
  await tenantApp.register(authRoutes)
  await tenantApp.register(publicRoutes)
  await tenantApp.register(categoryRoutes)
  await tenantApp.register(productRoutes)
  await tenantApp.register(saleRoutes)
  await tenantApp.register(analyticsRoutes)
  await tenantApp.register(documentRoutes)
  await tenantApp.register(uploadRoutes)
})

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })

const shutdown = async () => { await app.close(); process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
