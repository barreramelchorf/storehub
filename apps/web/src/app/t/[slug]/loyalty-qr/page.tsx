import { LoyaltyQrClient } from './LoyaltyQrClient'
import { api } from '@/lib/api'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: { params: { slug: string }; searchParams: { program?: string } }): Promise<Metadata> {
  const q = searchParams.program ? `?program=${searchParams.program}` : ''
  try {
    const info = await api(`/api/public/loyalty/enroll${q}`, { headers: { 'x-tenant-slug': params.slug } })
    return { title: `Regístrate — ${info.businessName}` }
  } catch {
    return { title: 'Regístrate' }
  }
}

export default async function LoyaltyQrPage({ params, searchParams }: { params: { slug: string }; searchParams: { program?: string } }) {
  const q = searchParams.program ? `?program=${searchParams.program}` : ''
  let program: any = null
  try {
    program = await api(`/api/public/loyalty/enroll${q}`, { headers: { 'x-tenant-slug': params.slug } })
  } catch {
    // module off / no program / ambiguous
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
      programId={searchParams.program ?? program.programId}
      businessName={program.businessName}
      programName={program.programName}
      rewardDescription={program.rewardDescription}
      rewardThreshold={program.rewardThreshold}
    />
  )
}
