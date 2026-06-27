import './globals.css'
import type { Metadata } from 'next'
import { Providers } from '@/components/providers'

export const metadata: Metadata = { title: 'StoreHub' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
