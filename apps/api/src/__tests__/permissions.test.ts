import { describe, it, expect, vi } from 'vitest'
import { requirePermission } from '../middleware/permissions.js'

describe('requirePermission', () => {
  it('calls next if permission exists', async () => {
    const handler = requirePermission('sales.create')
    const request = { user: { permissions: ['sales.create', 'inventory.view'] } } as any
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() } as any

    await handler(request, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('returns 403 if permission missing', async () => {
    const handler = requirePermission('settings.manage')
    const request = { user: { permissions: ['sales.create'] } } as any
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() } as any

    await handler(request, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden' })
  })
})
