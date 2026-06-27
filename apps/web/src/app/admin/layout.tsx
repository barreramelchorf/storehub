'use client'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'

const nav = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/pos', label: 'Punto de Venta' },
  { href: '/admin/inventory', label: 'Inventario' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/documents', label: 'Documentos' },
  { href: '/admin/settings', label: 'Configuración' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  const setToken = useAuthStore(s => s.setToken)
  const router = useRouter()

  useEffect(() => { if (!token) router.push('/admin/login') }, [token, router])
  if (!token) return null

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-gray-900 text-white p-4 space-y-2 hidden md:block">
        <h2 className="text-lg font-bold mb-4">StoreHub</h2>
        {nav.map(n => <Link key={n.href} href={n.href} className="block py-2 px-3 rounded hover:bg-gray-700 text-sm">{n.label}</Link>)}
        <button onClick={() => setToken(null)} className="block py-2 px-3 rounded hover:bg-gray-700 text-sm text-red-300 mt-8">Cerrar sesión</button>
      </aside>
      <main className="flex-1 p-6 bg-gray-50">{children}</main>
    </div>
  )
}
