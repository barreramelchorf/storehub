import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signTokens } from '../plugins/jwt.js'

// Mock db for integration tests without a real database
vi.mock('@storehub/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      tenants: {
        findMany: vi.fn(),
      },
    },
    execute: vi.fn(),
  },
  tenants: { id: 'id', slug: 'slug', customDomain: 'custom_domain' },
  users: { id: 'id', email: 'email', tenantId: 'tenant_id', active: 'active', roleId: 'role_id', passwordHash: 'password_hash' },
  roles: { id: 'id', permissions: 'permissions' },
}))

describe('Auth Integration', () => {
  it('signTokens produces valid tokens with correct payload', async () => {
    const payload = { userId: 'user-123', tenantId: 'tenant-456', permissions: ['sales.create', 'inventory.view'] }
    const { accessToken, refreshToken } = await signTokens(payload)

    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()
    expect(accessToken).not.toBe(refreshToken)

    // Verify access token has all fields
    const parts = accessToken.split('.')
    expect(parts).toHaveLength(3)
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    expect(decoded.userId).toBe('user-123')
    expect(decoded.tenantId).toBe('tenant-456')
    expect(decoded.permissions).toContain('sales.create')
    expect(decoded.exp).toBeDefined()
  })

  it('refresh token only contains userId and tenantId', async () => {
    const payload = { userId: 'user-123', tenantId: 'tenant-456', permissions: ['sales.create'] }
    const { refreshToken } = await signTokens(payload)

    const parts = refreshToken.split('.')
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    expect(decoded.userId).toBe('user-123')
    expect(decoded.tenantId).toBe('tenant-456')
    expect(decoded.permissions).toBeUndefined() // refresh token shouldn't have permissions
  })
})
