import type { FastifyInstance } from 'fastify'
import { db } from '@storehub/db'
import { sql } from 'drizzle-orm'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    await db.execute(sql`SELECT 1`)
    return { status: 'ok', db: 'connected' }
  })
}
