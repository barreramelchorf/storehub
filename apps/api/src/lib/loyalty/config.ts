/**
 * Loyalty module configuration — reads Apple/Google Wallet secrets and tuning
 * params from the environment.
 *
 * Secrets are injected as Kubernetes secrets via Pulumi (same pattern as
 * JWT_SECRET / MINIO_*). Certs/keys are passed PEM-encoded (multiline) env vars.
 *
 * Graceful degradation: if a platform's secrets are missing, that platform's
 * helpers report "not configured" and pass generation for it is skipped, rather
 * than crashing the API. This lets the module ship (and tenants that don't use
 * loyalty keep working) before the certs are loaded.
 */

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim().length > 0 ? v : undefined
}

export interface AppleConfig {
  passTypeId: string
  teamId: string
  /** PEM-encoded signer certificate (the Pass Type ID cert). */
  signerCert: string
  /** PEM-encoded signer private key. */
  signerKey: string
  /** Optional passphrase for the signer key. */
  signerKeyPassphrase?: string
  /** PEM-encoded Apple WWDR intermediate certificate. */
  wwdr: string
  /** Organization name shown on the pass (emisor técnico). */
  organizationName: string
}

export interface GoogleConfig {
  issuerId: string
  /** Service account client email. */
  clientEmail: string
  /** Service account private key (PEM). */
  privateKey: string
}

export interface LoyaltyRateConfig {
  /** Max pushes per window for mass operations (campaigns/global updates). */
  pushRateMax: number
  /** Window duration in ms for the rate limiter. */
  pushRateMs: number
}

export function getAppleConfig(): AppleConfig | null {
  const passTypeId = env('APPLE_PASS_TYPE_ID')
  const teamId = env('APPLE_TEAM_ID')
  const signerCert = env('APPLE_PASS_CERT')
  const signerKey = env('APPLE_PASS_KEY')
  const wwdr = env('APPLE_WWDR_CERT')
  if (!passTypeId || !teamId || !signerCert || !signerKey || !wwdr) return null
  return {
    passTypeId,
    teamId,
    signerCert,
    signerKey,
    signerKeyPassphrase: env('APPLE_PASS_CERT_PASSWORD'),
    wwdr,
    organizationName: env('APPLE_PASS_ORG_NAME') ?? 'StoreHub',
  }
}

export function getGoogleConfig(): GoogleConfig | null {
  const issuerId = env('GOOGLE_WALLET_ISSUER_ID')
  // The service account JSON can be provided whole, or split into the two
  // fields we actually use. Prefer the whole JSON if present.
  const saJson = env('GOOGLE_WALLET_SA_JSON')
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson) as { client_email?: string; private_key?: string }
      if (issuerId && parsed.client_email && parsed.private_key) {
        return { issuerId, clientEmail: parsed.client_email, privateKey: parsed.private_key }
      }
    } catch {
      // fall through to discrete env vars
    }
  }
  const clientEmail = env('GOOGLE_WALLET_CLIENT_EMAIL')
  const privateKey = env('GOOGLE_WALLET_PRIVATE_KEY')
  if (!issuerId || !clientEmail || !privateKey) return null
  return { issuerId, clientEmail, privateKey }
}

export function isAppleConfigured(): boolean {
  return getAppleConfig() !== null
}

export function isGoogleConfigured(): boolean {
  return getGoogleConfig() !== null
}

export function getRateConfig(): LoyaltyRateConfig {
  return {
    pushRateMax: Number(env('LOYALTY_PUSH_RATE_MAX') ?? 10),
    pushRateMs: Number(env('LOYALTY_PUSH_RATE_MS') ?? 1000),
  }
}

/**
 * Base URL the Apple pass uses as webServiceURL and the one embedded in
 * "Add to Wallet" links. Uses the platform domain (not per-tenant custom
 * domains) — confirmed design decision. Must be HTTPS in production.
 */
export function getWebServiceBaseUrl(): string {
  const explicit = env('LOYALTY_WEB_SERVICE_URL')
  if (explicit) return explicit.replace(/\/$/, '')
  const platformDomain = env('PLATFORM_DOMAIN') ?? 'localhost'
  const scheme = platformDomain === 'localhost' ? 'http' : 'https'
  return `${scheme}://${platformDomain}`
}
