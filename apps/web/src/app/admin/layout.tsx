'use client'
import { useAuthStore, useHydrated } from '@/lib/store'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const nav = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/pos', label: 'Punto de Venta', icon: '🛒' },
  { href: '/admin/inventory', label: 'Inventario', icon: '📦' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { href: '/admin/approvals', label: 'Aprobaciones', icon: '✅' },
  { href: '/admin/documents', label: 'Documentos', icon: '📄' },
  { href: '/admin/users', label: 'Usuarios', icon: '👤' },
  { href: '/admin/audit', label: 'Auditoría', icon: '🔍' },
  { href: '/admin/settings', label: 'Configuración', icon: '⚙️' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  const setToken = useAuthStore(s => s.setToken)
  const router = useRouter()
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'
  const hydrated = useHydrated()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (hydrated && !token && !isLoginPage) router.push('/admin/login')
  }, [token, isLoginPage, router, hydrated])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  if (isLoginPage) return <>{children}</>
  if (!hydrated || !token) return null

  return (
    <div className="min-h-screen flex bg-[var(--color-surface)]">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-[var(--color-secondary)] flex items-center px-4 z-40 md:hidden">
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-white text-2xl">☰</button>
        <span className="text-white font-bold ml-3">StoreHub</span>
      </div>

      {/* Overlay */}
      {menuOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMenuOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed md:static top-0 left-0 h-full w-60 bg-[var(--color-secondary)] text-white p-5 flex flex-col z-50 transition-transform md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <h2 className="text-lg font-bold mb-8 tracking-tight">StoreHub</h2>
        <nav className="flex-1 space-y-1">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm transition-colors ${pathname === n.href ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
              <span>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <button onClick={() => setToken(null)} className="flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors mt-4">
          🚪 Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 p-6 md:p-8 overflow-auto pt-20 md:pt-8">{children}</main>
    </div>
  )
}
