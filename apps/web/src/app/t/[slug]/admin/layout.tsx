'use client'
import { useHydrated, getAuthStore } from '@/lib/store'
import { useRouter, usePathname, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startProactiveRefresh } from '@/lib/auth'
import { setAuthCallbacks } from '@/lib/api'
import { api } from '@/lib/api'
import Link from 'next/link'

export default function TenantAdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const slug = params.slug as string
  const store = getAuthStore(slug)
  const token = store(s => s.token)
  const setToken = store(s => s.setToken)
  const router = useRouter()
  const pathname = usePathname()
  const hydrated = useHydrated()
  const [menuOpen, setMenuOpen] = useState(false)

  // On custom domains, URLs are /admin/* not /t/:slug/admin/*
  const isCustomDomain = typeof window !== 'undefined' && !window.location.pathname.startsWith('/t/')
  const base = isCustomDomain ? '/admin' : `/t/${slug}/admin`
  const isLoginPage = pathname.endsWith('/admin/login')

  // Extract permissions from token
  const userPermissions: string[] = (() => {
    if (!token) return []
    try {
      const payload = token.split('.')[1]
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4)
      return JSON.parse(atob(padded)).permissions ?? []
    } catch { return [] }
  })()

  const allNav = [
    { href: base, label: 'Dashboard', icon: '📊', permission: 'analytics.view' },
    { href: `${base}/pos`, label: 'Punto de Venta', icon: '🛒', permission: 'sales.create' },
    { href: `${base}/sales`, label: 'Ventas', icon: '💰', permission: 'sales.view' },
    { href: `${base}/inventory`, label: 'Inventario', icon: '📦', permission: 'inventory.view' },
    { href: `${base}/analytics`, label: 'Analytics', icon: '📈', permission: 'analytics.view' },
    { href: `${base}/approvals`, label: 'Aprobaciones', icon: '✅', permission: 'users.manage' },
    { href: `${base}/documents`, label: 'Documentos', icon: '📄', permission: 'documents.manage' },
    { href: `${base}/users`, label: 'Usuarios', icon: '👤', permission: 'users.manage' },
    { href: `${base}/audit`, label: 'Auditoría', icon: '🔍', permission: 'audit.view' },
    { href: `${base}/settings`, label: 'Configuración', icon: '⚙️', permission: 'settings.manage' },
  ]

  const nav = allNav.filter(n => userPermissions.includes(n.permission))

  useEffect(() => {
    if (hydrated && !token && !isLoginPage) router.push(`${base}/login`)
  }, [token, isLoginPage, router, hydrated, base])

  // Proactive token refresh (checks every 60s, refreshes if expiring in <2min)
  useEffect(() => {
    if (token) {
      // Register auth callbacks for the api interceptor
      setAuthCallbacks({
        onRefreshed: (t) => setToken(t),
        onExpired: () => { setToken(null); router.push(`${base}/login?expired=1`) },
        getToken: () => store.getState().token,
      })
      return startProactiveRefresh()
    }
  }, [token, base, router, setToken])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  // Load tenant config for branding
  const { data: tenantConfig } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: () => api('/api/admin/settings', { token: token! }),
    enabled: !!token,
  })

  const primaryColor = tenantConfig?.config?.branding?.primaryColor || '#635BFF'
  const secondaryColor = tenantConfig?.config?.branding?.secondaryColor || '#0A2540'
  const tenantName = tenantConfig?.config?.meta?.title || tenantConfig?.name || slug

  // Dynamic page title - update on every navigation
  useEffect(() => {
    if (tenantName) document.title = `${tenantName} — Admin`
  }, [tenantName, pathname])

  if (isLoginPage) return <>{children}</>
  if (!hydrated || !token) return null

  // Check if user must change password
  const isChangePasswordPage = pathname.endsWith('/change-password')
  const mustChangePassword = (() => {
    try {
      const payload = token.split('.')[1]
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4)
      return JSON.parse(atob(padded)).mustChangePassword ?? false
    } catch { return false }
  })()

  if (mustChangePassword && !isChangePasswordPage) {
    router.push(`${base}/change-password`)
    return null
  }
  if (isChangePasswordPage) return <>{children}</>

  const cssVars = { '--color-primary': primaryColor, '--color-secondary': secondaryColor, '--color-text-dark': secondaryColor } as React.CSSProperties
  const ready = !!tenantConfig

  return (
    <div className={`min-h-screen flex bg-[var(--color-surface)] transition-opacity duration-150 ${ready ? 'opacity-100' : 'opacity-0'}`} style={cssVars}>
      <div className="fixed top-0 left-0 right-0 h-14 bg-[var(--color-secondary)] flex items-center px-4 z-40 md:hidden">
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-white text-2xl">☰</button>
        <span className="text-white font-bold ml-3">{tenantName}</span>
      </div>
      {menuOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed md:sticky md:top-0 top-0 left-0 h-full md:h-screen w-60 bg-[var(--color-secondary)] text-white p-5 flex flex-col z-50 transition-transform md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <h2 className="text-lg font-bold mb-8 tracking-tight">{tenantName}</h2>
        <nav className="flex-1 space-y-1">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm transition-colors ${(pathname === n.href || pathname === n.href.replace('/admin', `/t/${slug}/admin`)) ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
              <span>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <Link href={`${base}/profile`} className="flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors mt-4">
          👤 Mi perfil
        </Link>
        <button onClick={() => { setToken(null); router.push(`${base}/login`) }} className="flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors">
          🚪 Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 p-6 md:p-8 overflow-auto pt-20 md:pt-8">{children}</main>
    </div>
  )
}
