import { headers } from 'next/headers'
import { api } from '@/lib/api'
import { StoreClient } from '@/components/StoreClient'
import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const headersList = headers()
  const host = headersList.get('host')?.split(':')[0] ?? 'localhost'
  const isPlatform = host.includes('storehub') || host === 'localhost'
  if (isPlatform) return { title: 'StoreHub' }

  try {
    const opts = { host: headersList.get('host') ?? '' }
    const info = await api('/api/public/info', opts)
    return {
      title: info.config?.meta?.title || info.name || 'Tienda',
      description: info.config?.meta?.description || undefined,
    }
  } catch {
    return { title: 'Tienda' }
  }
}

export default async function RootPage() {
  const headersList = headers()
  const host = headersList.get('host')?.split(':')[0] ?? 'localhost'

  // If it's a custom domain (not the platform domain), show the tenant store
  const isPlatform = host.includes('storehub') || host === 'localhost'

  if (!isPlatform) {
    // Custom domain — resolve tenant and show store
    try {
      const opts = { host: headersList.get('host') ?? '' }
      const [{ items: products }, categories, info] = await Promise.all([
        api('/api/public/products', opts),
        api('/api/public/categories', opts),
        api('/api/public/info', opts),
      ])

      const primaryColor = info.config?.branding?.primaryColor || '#635BFF'
      const secondaryColor = info.config?.branding?.secondaryColor || '#0A2540'

      return (
        <main className="min-h-screen bg-white" style={{ '--color-primary': primaryColor, '--color-secondary': secondaryColor, '--color-text-dark': secondaryColor } as React.CSSProperties}>
          <header className="border-b border-[var(--color-border)] px-6 py-8 md:px-12 md:py-12">
            <div className="max-w-6xl mx-auto">
              <h1 className="text-3xl md:text-4xl font-bold text-[var(--color-text-dark)]">{info.name}</h1>
              {info.config?.meta?.description && <p className="text-[var(--color-text)] mt-2 text-lg">{info.config.meta.description}</p>}
            </div>
          </header>
          <div className="max-w-6xl mx-auto px-6 md:px-12 py-8">
            <StoreClient products={products} categories={categories} info={info} />
          </div>
          <footer className="border-t border-[var(--color-border)] mt-12 py-8 px-6 md:px-12">
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-[var(--color-text)]">
              <div>
                <h3 className="font-semibold text-[var(--color-text-dark)] mb-2">{info.name}</h3>
                {info.config?.contact?.address && <p>{info.config.contact.address}</p>}
                {info.config?.contact?.hours && <p className="mt-1">{info.config.contact.hours}</p>}
              </div>
              <div>
                <h3 className="font-semibold text-[var(--color-text-dark)] mb-2">Contacto</h3>
                {info.config?.contact?.phone && <p>{info.config.contact.phone}</p>}
                {info.config?.contact?.whatsapp && <p>WhatsApp: {info.config.contact.whatsapp}</p>}
              </div>
              <div>
                <h3 className="font-semibold text-[var(--color-text-dark)] mb-2">Redes</h3>
                {info.config?.social?.instagram && <a href={`https://instagram.com/${info.config.social.instagram}`} className="text-[var(--color-primary)] hover:underline block">Instagram</a>}
                {info.config?.social?.facebook && <a href={info.config.social.facebook} className="text-[var(--color-primary)] hover:underline block">Facebook</a>}
              </div>
            </div>
          </footer>
        </main>
      )
    } catch {
      // Fallback to landing if tenant not found
    }
  }

  // Platform landing
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-[var(--color-text-dark)] mb-4">StoreHub</h1>
      <p className="text-[var(--color-text)] text-center max-w-md mb-8">Plataforma de gestión de tiendas — punto de venta, inventario y tienda pública.</p>
      <div className="flex gap-4">
        <Link href="/platform/login" className="btn-primary">Platform Admin</Link>
      </div>
    </main>
  )
}
