'use client'
import { useHydrated } from '@/lib/store'
import { useRouter, usePathname, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { startProactiveRefresh } from '@/lib/auth'
import { setAuthCallbacks } from '@/lib/api'
import Link from 'next/link'
import { getAuthStore } from '@/lib/store'

export default function TenantAdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const slug = params.slug as string
  const store = getAuthStore(slug)
  const token = store(s => s.token)
  const setToken = store(s => s.setToken)
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const slug = params.slug as string
  const hydrated = useHydrated()
  const [menuOpen, setMenuOpen] = useState(false)

  const base = `/t/${slug}/admin`
  const isLoginPage = pathname === `${base}/login`

  const nav = [
    { href: base, label: 'Dashboard', icon: '📊' },
    { href: `${base}/pos`, label: 'Punto de Venta', icon: '🛒' },
    { href: `${base}/inventory`, label: 'Inventario', icon: '📦' },
    { href: `${base}/analytics`, label: 'Analytics', icon: '📈' },
    { href: `${base}/approvals`, label: 'Aprobaciones', icon: '✅' },
    { href: `${base}/documents`, label: 'Documentos', icon: '📄' },
    { href: `${base}/users`, label: 'Usuarios', icon: '👤' },
    { href: `${base}/audit`, label: 'Auditoría', icon: '🔍' },
    { href: `${base}/settings`, label: 'Configuración', icon: '⚙️' },
  ]

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

  if (isLoginPage) return <>{children}</>
  if (!hydrated || !token) return null

  return (
    <div className="min-h-screen flex bg-[var(--color-surface)]">
      <div className="fixed top-0 left-0 right-0 h-14 bg-[var(--color-secondary)] flex items-center px-4 z-40 md:hidden">
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-white text-2xl">☰</button>
        <span className="text-white font-bold ml-3">{slug}</span>
      </div>
      {menuOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed md:static top-0 left-0 h-full md:min-h-screen w-60 bg-[var(--color-secondary)] text-white p-5 flex flex-col z-50 transition-transform md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <h2 className="text-lg font-bold mb-8 tracking-tight">{slug}</h2>
        <nav className="flex-1 space-y-1">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm transition-colors ${pathname === n.href ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
              <span>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <button onClick={() => { setToken(null); router.push(`${base}/login`) }} className="flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors mt-4">
          🚪 Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 p-6 md:p-8 overflow-auto pt-20 md:pt-8">{children}</main>
    </div>
  )
}
