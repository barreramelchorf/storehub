import { api } from '@/lib/api'
import { LoyaltyEnrollClient } from './LoyaltyEnrollClient'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: { params: { slug: string }; searchParams: { program?: string } }): Promise<Metadata> {
  const q = searchParams.program ? `?program=${searchParams.program}` : ''
  const opts = { headers: { 'x-tenant-slug': params.slug } }
  try {
    const info = await api(`/api/public/loyalty/enroll${q}`, opts)
    return { title: `${info.programName} — ${info.businessName}` }
  } catch {
    return { title: 'Programa de lealtad' }
  }
}

export default async function LoyaltyEnrollPage({ params, searchParams }: { params: { slug: string }; searchParams: { program?: string } }) {
  const opts = { headers: { 'x-tenant-slug': params.slug } }
  const q = searchParams.program ? `?program=${searchParams.program}` : ''

  let program: any = null
  try {
    program = await api(`/api/public/loyalty/enroll${q}`, opts)
  } catch {
    // Module disabled, no program, or ambiguous (multiple, none specified).
  }

  if (!program) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Programa de lealtad no disponible</h1>
          <p className="text-gray-500 mt-2">Este negocio aún no tiene un programa de lealtad activo, o el enlace no especifica el programa.</p>
        </div>
      </main>
    )
  }

  const bg = program.branding?.bgColor || '#1f2937'
  const fg = program.branding?.fgColor || '#ffffff'

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero with program branding */}
      <header className="px-6 py-10 md:py-14 text-center" style={{ backgroundColor: bg, color: fg }}>
        {program.branding?.logoUrl && (
          <img src={program.branding.logoUrl} alt={program.businessName} className="h-16 mx-auto mb-4 object-contain" />
        )}
        <h1 className="text-2xl md:text-3xl font-bold">{program.programName}</h1>
        <p className="opacity-80 mt-1">{program.businessName}</p>
        {program.rewardDescription && program.rewardThreshold && (
          <p className="mt-4 inline-block bg-white/15 rounded-full px-4 py-1.5 text-sm">
            🎁 {program.rewardDescription} al llegar a {program.rewardThreshold} puntos
          </p>
        )}
      </header>

      <div className="max-w-md mx-auto px-6 py-8">
        <LoyaltyEnrollClient slug={params.slug} programId={program.programId} />
      </div>
    </main>
  )
}
