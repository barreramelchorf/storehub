'use client'

// Same neutral defaults the real pass generator uses (apps/api .../pass-data.ts DEFAULT_BRANDING).
const DEFAULTS = { bg: '#1f2937', fg: '#ffffff', label: '#cbd5e1' }

// Fixed pseudo-QR so the card has a recognizable barcode area (not a real code).
const QR_ON = [0, 1, 3, 4, 5, 7, 9, 12, 15, 17, 20, 21, 23, 24]

export interface PassPreviewProps {
  businessName: string
  programName: string
  /** Values set on the program (empty = inherit). */
  programBranding: { bgColor?: string; fgColor?: string; labelColor?: string; logoUrl?: string }
  /** Store branding of the tenant, used when the program leaves a value empty. */
  tenantBranding: { primaryColor?: string; secondaryColor?: string; logoUrl?: string }
  /** Points shown on the sample card (what a new card starts with). */
  samplePoints: number
  rewardThreshold: number | null
  rewardDescription: string | null
}

function FakeQr({ size }: { size: number }) {
  return (
    <div className="grid grid-cols-5 gap-[2px]" style={{ width: size, height: size }} aria-label="Código QR de ejemplo">
      {Array.from({ length: 25 }).map((_, i) => (
        <div key={i} className={QR_ON.includes(i) ? 'bg-gray-900' : 'bg-gray-200'} />
      ))}
    </div>
  )
}

/**
 * Approximate preview of BOTH wallet cards. Apple and Google render different
 * layouts, so both are shown at once. It is NOT the real .pkpass / Google object:
 * it mirrors the same color/logo resolution (program -> tenant -> defaults/text)
 * and the same fields, so the admin can judge colors and layout.
 */
export function PassPreview(p: PassPreviewProps) {
  const bg = p.programBranding.bgColor || p.tenantBranding.primaryColor || DEFAULTS.bg
  const fg = p.programBranding.fgColor || DEFAULTS.fg
  const label = p.programBranding.labelColor || p.tenantBranding.secondaryColor || DEFAULTS.label
  // Logo chain: program logo -> store logo -> none (text-only, like the real pass).
  const logo = p.programBranding.logoUrl || p.tenantBranding.logoUrl || ''
  const remaining = p.rewardThreshold ? Math.max(0, p.rewardThreshold - p.samplePoints) : null
  const name = p.businessName || 'Tu negocio'

  const Logo = ({ size, round }: { size: number; round?: boolean }) =>
    logo
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={logo} alt="" style={{ height: size, width: size }} className={`object-contain ${round ? 'rounded-full bg-white' : 'rounded'}`} />
      : null

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-gray-700">Vista previa</p>

      {/* Apple Wallet */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5 text-center">Apple Wallet</p>
        <div className="rounded-2xl shadow-md p-4 w-full max-w-[280px] mx-auto" style={{ background: bg, color: fg }}>
          <div className="flex items-center gap-2 mb-4">
            <Logo size={26} />
            <span className="text-sm font-semibold truncate">{name}</span>
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
            <FakeQr size={88} />
          </div>
        </div>
      </div>

      {/* Google Wallet */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5 text-center">Google Wallet</p>
        <div className="rounded-2xl shadow-md w-full max-w-[280px] mx-auto overflow-hidden border border-gray-100 bg-white">
          <div className="p-4" style={{ background: bg, color: '#ffffff' }}>
            <div className="flex items-center gap-2 mb-3">
              <Logo size={26} round />
              <span className="text-sm font-semibold truncate">{name}</span>
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
              <FakeQr size={72} />
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Vista aproximada. En Google solo se aplica el color de fondo; el color del texto lo decide Google.
        Sin logo, la tarjeta muestra solo el nombre del negocio.
      </p>
    </div>
  )
}
