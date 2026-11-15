import type { FastifyInstance } from 'fastify'
import { db } from '@storehub/db'
import { sql } from 'drizzle-orm'

export async function healthRoutes(app: FastifyInstance) {
  // Exempt from rate limiting: it's the cluster's liveness/readiness probe.
  app.get('/health', { config: { rateLimit: false } }, async () => {
    await db.execute(sql`SELECT 1`)
    return { status: 'ok', db: 'connected' }
  })
}
