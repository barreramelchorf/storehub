'use client'
import { useState } from 'react'

// Same neutral defaults the real pass generator uses (apps/api .../pass-data.ts DEFAULT_BRANDING).
const DEFAULTS = { bg: '#1f2937', fg: '#ffffff', label: '#cbd5e1' }

export interface PassPreviewProps {
  businessName: string
  programName: string
  /** Colors set on the program (empty = inherit). */
  programBranding: { bgColor?: string; fgColor?: string; labelColor?: string }
  /** Store branding of the tenant, used when the program leaves a color empty. */
  tenantBranding: { primaryColor?: string; secondaryColor?: string; logoUrl?: string }
  /** Points shown on the sample card (what a new card starts with). */
  samplePoints: number
  rewardThreshold: number | null
  rewardDescription: string | null
}

/**
 * Approximate preview of the wallet card. It is NOT the real .pkpass / Google
 * object: it mirrors the same color resolution (program -> tenant -> defaults)
 * and the same fields, so the admin can judge colors and layout.
 */
export function PassPreview(p: PassPreviewProps) {
  const [platform, setPlatform] = useState<'apple' | 'google'>('apple')

  const bg = p.programBranding.bgColor || p.tenantBranding.primaryColor || DEFAULTS.bg
  const fg = p.programBranding.fgColor || DEFAULTS.fg
  const label = p.programBranding.labelColor || p.tenantBranding.secondaryColor || DEFAULTS.label
  const logo = p.tenantBranding.logoUrl
  const remaining = p.rewardThreshold ? Math.max(0, p.rewardThreshold - p.samplePoints) : null

  const Logo = ({ size }: { size: number }) =>
    logo
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={logo} alt="" style={{ height: size, width: size }} className="object-contain rounded" />
      : <div style={{ height: size, width: size, background: label, color: bg }} className="rounded flex items-center justify-center text-xs font-bold">
          {(p.businessName || '?').charAt(0).toUpperCase()}
        </div>

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700">Vista previa</p>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['apple', 'google'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setPlatform(k)}
              className={`px-3 py-1 ${platform === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {k === 'apple' ? 'Apple' : 'Google'}
            </button>
          ))}
        </div>
      </div>

      {platform === 'apple' ? (
        <div className="rounded-2xl shadow-md p-4 w-full max-w-[300px] mx-auto" style={{ background: bg, color: fg }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Logo size={28} />
              <span className="text-sm font-semibold truncate">{p.businessName}</span>
            </div>
          </div>
          <p className="text-[10px] tracking-wide" style={{ color: label }}>PUNTOS</p>
          <p className="text-4xl font-light leading-none mb-4">{p.samplePoints}</p>
          {p.rewardThreshold ? (
            <div className="flex justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-[10px] tracking-wide" style={{ color: label }}>RECOMPENSA</p>
                <p className="text-sm truncate">{p.rewardDescription || 'Recompensa'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] tracking-wide" style={{ color: label }}>TE FALTAN</p>
                <p className="text-sm">{remaining && remaining > 0 ? `${remaining} pts` : '¡Lista!'}</p>
              </div>
            </div>
          ) : null}
          <div className="mb-4">
            <p className="text-[10px] tracking-wide" style={{ color: label }}>MIEMBRO</p>
            <p className="text-sm">Nombre del cliente</p>
          </div>
          <div className="bg-white rounded-lg p-3 flex items-center justify-center">
            <div className="grid grid-cols-5 gap-[2px] w-24 h-24" aria-label="Código QR de ejemplo">
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} className={[0, 1, 5, 4, 3, 9, 15, 20, 21, 23, 24, 12, 7, 17].includes(i) ? 'bg-gray-900' : 'bg-gray-200'} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl shadow-md w-full max-w-[300px] mx-auto overflow-hidden border border-gray-100 bg-white">
          <div className="p-4" style={{ background: bg, color: '#ffffff' }}>
            <div className="flex items-center gap-2 mb-3">
              <Logo size={28} />
              <span className="text-sm font-semibold truncate">{p.businessName}</span>
            </div>
            <p className="text-xs opacity-80">{p.programName || 'Programa'}</p>
            <p className="text-xs opacity-80 mt-2">Puntos</p>
            <p className="text-3xl font-medium leading-none">{p.samplePoints}</p>
          </div>
          <div className="p-4 text-gray-700">
            {p.rewardThreshold ? (
              <p className="text-xs mb-3"><span className="text-gray-400">Recompensa</span><br />{p.rewardDescription || 'Recompensa'} ({p.rewardThreshold} puntos)</p>
            ) : null}
            <div className="flex items-center justify-center">
              <div className="grid grid-cols-5 gap-[2px] w-20 h-20">
                {Array.from({ length: 25 }).map((_, i) => (
                  <div key={i} className={[0, 1, 5, 4, 3, 9, 15, 20, 21, 23, 24, 12, 7, 17].includes(i) ? 'bg-gray-900' : 'bg-gray-200'} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 text-center">
        Vista aproximada. {platform === 'google'
          ? 'En Google Wallet solo se aplica el color de fondo; Google decide el color del texto.'
          : 'El aspecto final lo termina de dibujar Apple Wallet.'}
      </p>
    </div>
  )
}
