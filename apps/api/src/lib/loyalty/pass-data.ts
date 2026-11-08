/**
 * Shared domain types for loyalty pass generation. Both Apple and Google pass
 * builders consume this normalized shape so the route/business layer never
 * deals with platform-specific field names.
 */

export interface PassBranding {
  logoUrl?: string
  /** Background color, hex (#RRGGBB). */
  bgColor?: string
  /** Foreground (text) color, hex. */
  fgColor?: string
  /** Label color, hex. */
  labelColor?: string
}

export interface PassData {
  /** Card id — also the opaque QR payload used for check-in scans. */
  cardId: string
  /** Serial number (stable identifier for the pass across updates). */
  serialNumber: string
  /** Per-pass shared secret for the Apple web service auth. */
  authToken: string
  /** Program display name, e.g. "Puntos Xalli". */
  programName: string
  /** Business/tenant display name. */
  businessName: string
  /** Current points balance. */
  points: number
  /** Points needed for the reward (optional). */
  rewardThreshold?: number | null
  /** Reward description, e.g. "Café gratis" (optional). */
  rewardDescription?: string | null
  /** Current offer message (campaign). Empty/undefined = no active offer. */
  offer?: string | null
  /** Customer display name. */
  customerName: string
  /** When true, the pass is voided/revoked (Apple voided:true, Google EXPIRED). */
  voided?: boolean
  branding: PassBranding
}

/** Default colors when the program has no branding override. */
export const DEFAULT_BRANDING: Required<Pick<PassBranding, 'bgColor' | 'fgColor' | 'labelColor'>> = {
  bgColor: '#1f2937', // slate-800
  fgColor: '#ffffff',
  labelColor: '#cbd5e1', // slate-300
}

/** Convert #RRGGBB to the "rgb(r, g, b)" format Apple/Google expect. */
export function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return 'rgb(31, 41, 55)'
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgb(${r}, ${g}, ${b})`
}
