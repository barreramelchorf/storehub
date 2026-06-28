'use client'
import { useAuthStore, useHydrated } from '@/lib/store'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
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

  useEffect(() => {
    if (hydrated && !token && !isLoginPage) router.push('/admin/login')
  }, [token, isLoginPage, router, hydrated])

  if (isLoginPage) return <>{children}</>
  if (!hydrated || !token) return null

  return (
    <div className="min-h-screen flex bg-[var(--color-surface)]">
      <aside className="w-60 bg-[var(--color-secondary)] text-white p-5 hidden md:flex flex-col">
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
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
