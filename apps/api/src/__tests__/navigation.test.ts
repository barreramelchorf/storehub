import { describe, it, expect } from 'vitest'

// Replicates the nav filtering logic from the admin layout
const NAV_ITEMS = [
  { label: 'Dashboard', permission: 'analytics.view' },
  { label: 'Punto de Venta', permission: 'sales.create' },
  { label: 'Ventas', permission: 'sales.delete' },
  { label: 'Inventario', permission: 'inventory.view' },
  { label: 'Analytics', permission: 'analytics.view' },
  { label: 'Aprobaciones', permission: 'users.manage' },
  { label: 'Documentos', permission: 'documents.manage' },
  { label: 'Usuarios', permission: 'users.manage' },
  { label: 'Auditoría', permission: 'audit.view' },
  { label: 'Configuración', permission: 'settings.manage' },
]

function getVisibleNav(permissions: string[]): string[] {
  return NAV_ITEMS.filter(n => permissions.includes(n.permission)).map(n => n.label)
}

// Login redirect logic
const LOGIN_ROUTES = [
  { path: '/', perm: 'analytics.view' },
  { path: '/pos', perm: 'sales.create' },
  { path: '/sales', perm: 'sales.view' },
  { path: '/inventory', perm: 'inventory.view' },
]

function getLoginRedirect(permissions: string[]): string {
  const first = LOGIN_ROUTES.find(r => permissions.includes(r.perm))
  return first?.path ?? '/'
}

describe('Navigation visibility per role', () => {
  describe('cajero', () => {
    const perms = ['sales.create', 'sales.delete']
    const nav = getVisibleNav(perms)

    it('sees POS and Ventas only', () => {
      expect(nav).toEqual(['Punto de Venta', 'Ventas'])
    })

    it('does NOT see Dashboard', () => {
      expect(nav).not.toContain('Dashboard')
    })

    it('does NOT see Inventario', () => {
      expect(nav).not.toContain('Inventario')
    })

    it('does NOT see Configuración', () => {
      expect(nav).not.toContain('Configuración')
    })
  })

  describe('almacenista', () => {
    const perms = ['inventory.view', 'inventory.restock']
    const nav = getVisibleNav(perms)

    it('sees Inventario only', () => {
      expect(nav).toEqual(['Inventario'])
    })
  })

  describe('cajero_almacenista', () => {
    const perms = ['sales.create', 'sales.delete', 'inventory.view', 'inventory.restock']
    const nav = getVisibleNav(perms)

    it('sees POS, Ventas, and Inventario', () => {
      expect(nav).toEqual(['Punto de Venta', 'Ventas', 'Inventario'])
    })
  })

  describe('gerente', () => {
    const perms = ['sales.create', 'sales.view', 'sales.delete', 'sales.override_price', 'sales.backdate', 'inventory.view', 'inventory.manage', 'inventory.restock', 'analytics.view', 'audit.view', 'documents.manage']
    const nav = getVisibleNav(perms)

    it('sees everything except Aprobaciones, Usuarios, and Configuración', () => {
      expect(nav).toContain('Dashboard')
      expect(nav).toContain('Punto de Venta')
      expect(nav).toContain('Ventas')
      expect(nav).toContain('Inventario')
      expect(nav).toContain('Analytics')
      expect(nav).toContain('Documentos')
      expect(nav).toContain('Auditoría')
      expect(nav).not.toContain('Aprobaciones')
      expect(nav).not.toContain('Usuarios')
      expect(nav).not.toContain('Configuración')
    })
  })

  describe('administrador', () => {
    const perms = ['sales.create', 'sales.view', 'sales.delete', 'sales.override_price', 'sales.backdate', 'inventory.view', 'inventory.manage', 'inventory.restock', 'analytics.view', 'audit.view', 'settings.manage', 'users.manage', 'documents.manage']
    const nav = getVisibleNav(perms)

    it('sees all navigation items', () => {
      expect(nav.length).toBe(NAV_ITEMS.length)
    })
  })
})

describe('Login redirect per role', () => {
  it('cajero → /pos (first match is sales.create)', () => {
    expect(getLoginRedirect(['sales.create', 'sales.delete'])).toBe('/pos')
  })

  it('almacenista → /inventory', () => {
    expect(getLoginRedirect(['inventory.view', 'inventory.restock'])).toBe('/inventory')
  })

  it('cajero_almacenista → /pos (sales.create matches first)', () => {
    expect(getLoginRedirect(['sales.create', 'sales.delete', 'inventory.view', 'inventory.restock'])).toBe('/pos')
  })

  it('administrador → / (analytics.view matches first = dashboard)', () => {
    expect(getLoginRedirect(['analytics.view', 'sales.create', 'inventory.view'])).toBe('/')
  })

  it('gerente → / (analytics.view matches first = dashboard)', () => {
    expect(getLoginRedirect(['analytics.view', 'sales.create'])).toBe('/')
  })
})
