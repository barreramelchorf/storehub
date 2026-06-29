'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const isLogin = pathname === '/platform/login'

  useEffect(() => {
    const key = localStorage.getItem('platform-key')
    if (key) setApiKey(key)
    else if (!isLogin) router.push('/platform/login')
  }, [isLogin, router])

  if (isLogin) return <>{children}</>
  if (!apiKey) return null

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <header className="bg-[var(--color-secondary)] text-white px-6 py-4 flex justify-between items-center">
        <h1 className="font-bold text-lg">StoreHub — Platform Admin</h1>
        <button onClick={() => { localStorage.removeItem('platform-key'); router.push('/platform/login') }} className="text-sm text-white/60 hover:text-white">Salir</button>
      </header>
      <main className="p-8 max-w-4xl mx-auto">{children}</main>
    </div>
  )
}
