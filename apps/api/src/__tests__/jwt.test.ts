import { describe, it, expect } from 'vitest'
import { signTokens, verifyToken } from '../plugins/jwt.js'

describe('JWT', () => {
  const payload = { userId: 'u1', tenantId: 't1', permissions: ['sales.create'] }

  it('signs and verifies tokens', async () => {
    const { accessToken, refreshToken } = await signTokens(payload)
    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()

    const decoded = await verifyToken(accessToken)
    expect(decoded.userId).toBe('u1')
    expect(decoded.tenantId).toBe('t1')
    expect(decoded.permissions).toContain('sales.create')
  })

  it('rejects invalid token', async () => {
    await expect(verifyToken('invalid.token.here')).rejects.toThrow()
  })
})
