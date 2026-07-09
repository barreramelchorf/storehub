import { describe, it, expect } from 'vitest'

// Role definitions (must match what's in seed/platform/migrations)
const ROLES = {
  administrador: ['sales.create', 'sales.view', 'sales.delete', 'sales.override_price', 'sales.backdate', 'inventory.view', 'inventory.manage', 'inventory.restock', 'analytics.view', 'audit.view', 'settings.manage', 'users.manage', 'documents.manage'],
  gerente: ['sales.create', 'sales.view', 'sales.delete', 'sales.override_price', 'sales.backdate', 'inventory.view', 'inventory.manage', 'inventory.restock', 'analytics.view', 'audit.view', 'documents.manage'],
  cajero: ['sales.create', 'sales.delete'],
  almacenista: ['inventory.view', 'inventory.restock'],
  cajero_almacenista: ['sales.create', 'sales.delete', 'inventory.view', 'inventory.restock'],
}

// Endpoint permission requirements (must match actual route preHandlers)
const ENDPOINTS = {
  'GET /api/admin/products': ['inventory.view', 'sales.create'], // OR
  'POST /api/admin/products': ['inventory.manage'],
  'PUT /api/admin/products/:id': ['inventory.manage'],
  'DELETE /api/admin/products/:id': ['inventory.manage'],
  'POST /api/admin/inventory/restock': ['inventory.restock'],
  'GET /api/admin/sales': ['sales.view', 'sales.delete'], // OR
  'GET /api/admin/sales/:id': ['sales.view', 'sales.delete'], // OR
  'POST /api/admin/sales': ['sales.create'],
  'DELETE /api/admin/sales/:id': ['sales.delete'], // + users.manage for direct
  'POST /api/admin/sales/:id/request-delete': ['sales.delete'],
  'POST /api/admin/sales/:id/approve': ['sales.view'],
  'GET /api/admin/analytics': ['analytics.view'],
  'GET /api/admin/analytics/yearly': ['analytics.view'],
  'GET /api/admin/users': ['users.manage'],
  'POST /api/admin/users': ['users.manage'],
  'PUT /api/admin/users/:id': ['users.manage'],
  'GET /api/admin/roles': ['users.manage'],
  'GET /api/admin/settings': ['settings.manage'],
  'PUT /api/admin/settings': ['settings.manage'],
  'GET /api/admin/audit': ['audit.view'],
  'GET /api/admin/bulk/template': ['inventory.manage'],
  'POST /api/admin/bulk/products': ['inventory.manage'],
}

function hasAccess(rolePermissions: string[], endpointPermissions: string[]): boolean {
  // OR logic: user needs at least one of the required permissions
  return endpointPermissions.some(p => rolePermissions.includes(p))
}

describe('Role permissions', () => {
  describe('cajero_almacenista = cajero + almacenista', () => {
    it('should have all permissions of cajero', () => {
      for (const perm of ROLES.cajero) {
        expect(ROLES.cajero_almacenista).toContain(perm)
      }
    })

    it('should have all permissions of almacenista', () => {
      for (const perm of ROLES.almacenista) {
        expect(ROLES.cajero_almacenista).toContain(perm)
      }
    })
  })

  describe('gerente has everything except users.manage and settings.manage', () => {
    it('should NOT have users.manage', () => {
      expect(ROLES.gerente).not.toContain('users.manage')
    })

    it('should NOT have settings.manage', () => {
      expect(ROLES.gerente).not.toContain('settings.manage')
    })

    it('should have sales.backdate', () => {
      expect(ROLES.gerente).toContain('sales.backdate')
    })
  })

  describe('administrador has all permissions', () => {
    it('should have every permission that exists in any role', () => {
      const allPerms = new Set(Object.values(ROLES).flat())
      for (const perm of allPerms) {
        expect(ROLES.administrador).toContain(perm)
      }
    })
  })
})

describe('Endpoint access per role', () => {
  describe('cajero', () => {
    const perms = ROLES.cajero

    it('can access products list (for POS)', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/products'])).toBe(true)
    })

    it('can create sales', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/sales'])).toBe(true)
    })

    it('can view sales (via sales.delete)', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/sales'])).toBe(true)
    })

    it('can request delete', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/sales/:id/request-delete'])).toBe(true)
    })

    it('cannot access analytics', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/analytics'])).toBe(false)
    })

    it('cannot manage inventory', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/products'])).toBe(false)
    })

    it('cannot manage users', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/users'])).toBe(false)
    })

    it('cannot access settings', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/settings'])).toBe(false)
    })

    it('cannot access audit', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/audit'])).toBe(false)
    })

    it('cannot do bulk import', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/bulk/products'])).toBe(false)
    })
  })

  describe('almacenista', () => {
    const perms = ROLES.almacenista

    it('can view products', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/products'])).toBe(true)
    })

    it('can restock', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/inventory/restock'])).toBe(true)
    })

    it('cannot create sales', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/sales'])).toBe(false)
    })

    it('cannot view sales', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/sales'])).toBe(false)
    })

    it('cannot manage products (create/edit/delete)', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/products'])).toBe(false)
    })

    it('cannot access analytics', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/analytics'])).toBe(false)
    })
  })

  describe('cajero_almacenista', () => {
    const perms = ROLES.cajero_almacenista

    it('can access products (POS + inventory)', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/products'])).toBe(true)
    })

    it('can create sales', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/sales'])).toBe(true)
    })

    it('can view sales', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/sales'])).toBe(true)
    })

    it('can restock', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/inventory/restock'])).toBe(true)
    })

    it('can request delete', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/sales/:id/request-delete'])).toBe(true)
    })

    it('cannot manage products', () => {
      expect(hasAccess(perms, ENDPOINTS['POST /api/admin/products'])).toBe(false)
    })

    it('cannot access analytics', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/analytics'])).toBe(false)
    })

    it('cannot manage users', () => {
      expect(hasAccess(perms, ENDPOINTS['GET /api/admin/users'])).toBe(false)
    })
  })

  describe('administrador', () => {
    const perms = ROLES.administrador

    it('can access every endpoint', () => {
      for (const [endpoint, requiredPerms] of Object.entries(ENDPOINTS)) {
        expect(hasAccess(perms, requiredPerms), `should access ${endpoint}`).toBe(true)
      }
    })
  })
})
