/**
 * Apple Wallet pass (.pkpass) generation for loyalty cards.
 *
 * Uses passkit-generator (PKPass) building entirely from in-memory buffers —
 * no on-disk template — because branding is per-tenant and dynamic.
 *
 * The pass is a `storeCard` with:
 *  - points as the primary field
 *  - reward progress / offer as secondary/auxiliary fields
 *  - a QR barcode whose payload is the card id (used for check-in scans)
 *  - webServiceURL + authenticationToken so iOS can pull updates
 *
 * The "Oferta" field uses a changeMessage so campaign updates surface a
 * (discreet) lock-screen notification. See spec "Notificaciones / campañas".
 */
import { PKPass } from 'passkit-generator'
import { getAppleConfig, getWebServiceBaseUrl } from './config.js'
import { type PassData, DEFAULT_BRANDING, hexToRgb } from './pass-data.js'

/**
 * A 1x1 transparent PNG used as a placeholder icon/logo when the program has
 * no logo configured. Apple requires icon.png to exist in the bundle.
 */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function fetchImageBuffer(url?: string): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  } catch {
    return null
  }
}

/**
 * Build a signed .pkpass buffer for a loyalty card.
 * Throws if Apple is not configured — callers should check isAppleConfigured().
 */
export async function buildApplePass(data: PassData): Promise<Buffer> {
  const cfg = getAppleConfig()
  if (!cfg) throw new Error('Apple Wallet no está configurado (faltan certificados)')

  const bg = hexToRgb(data.branding.bgColor ?? DEFAULT_BRANDING.bgColor)
  const fg = hexToRgb(data.branding.fgColor ?? DEFAULT_BRANDING.fgColor)
  const label = hexToRgb(data.branding.labelColor ?? DEFAULT_BRANDING.labelColor)

  // Logo/icon: use program logo if available, else placeholder.
  const logo = (await fetchImageBuffer(data.branding.logoUrl)) ?? PLACEHOLDER_PNG

  const pass = new PKPass(
    {
      'icon.png': logo,
      'icon@2x.png': logo,
      'logo.png': logo,
      'logo@2x.png': logo,
    },
    {
      wwdr: cfg.wwdr,
      signerCert: cfg.signerCert,
      signerKey: cfg.signerKey,
      signerKeyPassphrase: cfg.signerKeyPassphrase,
    },
    {
      // Identity
      passTypeIdentifier: cfg.passTypeId,
      teamIdentifier: cfg.teamId,
      organizationName: cfg.organizationName,
      serialNumber: data.serialNumber,
      description: `${data.programName} — ${data.businessName}`,
      // Updates
      webServiceURL: `${getWebServiceBaseUrl()}/api/wallet/apple`,
      authenticationToken: data.authToken,
      // Colors
      backgroundColor: bg,
      foregroundColor: fg,
      labelColor: label,
      logoText: data.businessName,
    },
  )

  pass.type = 'storeCard'

  // Primary: points balance. changeMessage makes a scan (points change) notify.
  pass.primaryFields.push({
    key: 'points',
    label: 'PUNTOS',
    value: data.points,
    changeMessage: 'Ahora tienes %@ puntos',
  })

  // Secondary: reward progress (if configured)
  if (data.rewardThreshold && data.rewardThreshold > 0) {
    const remaining = Math.max(0, data.rewardThreshold - data.points)
    pass.secondaryFields.push({
      key: 'reward',
      label: 'RECOMPENSA',
      value: data.rewardDescription ?? 'Recompensa',
    })
    pass.secondaryFields.push({
      key: 'remaining',
      label: 'TE FALTAN',
      value: remaining > 0 ? `${remaining} pts` : '¡Lista!',
    })
  }

  // Auxiliary: member name
  pass.auxiliaryFields.push({
    key: 'member',
    label: 'MIEMBRO',
    value: data.customerName,
  })

  // Back + offer field with changeMessage so a campaign update notifies the user.
  pass.backFields.push({
    key: 'offer',
    label: 'Oferta',
    value: data.offer && data.offer.length > 0 ? data.offer : '—',
    changeMessage: 'Oferta: %@',
  })
  pass.backFields.push({
    key: 'program',
    label: 'Programa',
    value: data.programName,
  })

  // QR for check-in: payload is the card id.
  pass.setBarcodes({
    message: data.cardId,
    format: 'PKBarcodeFormatQR',
    messageEncoding: 'iso-8859-1',
    altText: data.serialNumber,
  })

  return pass.getAsBuffer()
}
