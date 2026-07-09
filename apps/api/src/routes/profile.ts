import type { FastifyInstance } from 'fastify'
import { db, users } from '@storehub/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { passwordSchema } from '@storehub/schemas'
import { authenticate } from '../middleware/auth.js'

export async function profileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Get current user profile
  app.get('/api/admin/profile', async (request) => {
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, request.user.id),
      columns: { id: true, email: true, username: true, roleId: true, active: true, createdAt: true },
      with: { role: { columns: { id: true, name: true } } },
    })
    return user
  })

  // Change own password (requires current password)
  app.put('/api/admin/profile/password', async (request, reply) => {
    const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string }
    if (!currentPassword || !newPassword) return reply.code(400).send({ error: 'currentPassword and newPassword required' })

    // Validate new password strength
    const passwordResult = passwordSchema.safeParse(newPassword)
    if (!passwordResult.success) return reply.code(400).send({ error: passwordResult.error.errors[0].message })

    // Verify current password
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, request.user.id),
      columns: { id: true, passwordHash: true },
    })
    if (!user) return reply.code(401).send({ error: 'Unauthorized' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return reply.code(400).send({ error: 'Contraseña actual incorrecta' })

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, request.user.id))

    return { ok: true }
  })
}
