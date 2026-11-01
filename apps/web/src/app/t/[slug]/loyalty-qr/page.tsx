import { LoyaltyQrClient } from './LoyaltyQrClient'
import { api } from '@/lib/api'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const info = await api('/api/public/loyalty/enroll', { headers: { 'x-tenant-slug': params.slug } })
    return { title: `Regístrate — ${info.businessName}` }
  } catch {
    return { title: 'Regístrate' }
  }
}

export default async function LoyaltyQrPage({ params }: { params: { slug: string } }) {
  let program: any = null
  try {
    program = await api('/api/public/loyalty/enroll', { headers: { 'x-tenant-slug': params.slug } })
  } catch {
    // module off / no program
  }

  if (!program) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-gray-500">Programa de lealtad no disponible.</p>
      </main>
    )
  }

  return (
    <LoyaltyQrClient
      slug={params.slug}
      businessName={program.businessName}
      programName={program.programName}
      rewardDescription={program.rewardDescription}
      rewardThreshold={program.rewardThreshold}
    />
  )
}
