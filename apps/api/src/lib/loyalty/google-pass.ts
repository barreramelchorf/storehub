/**
 * Google Wallet loyalty pass generation and updates.
 *
 * Model:
 *  - One LoyaltyClass per program/tenant (created/updated lazily).
 *  - One LoyaltyObject per card.
 *  - "Add to Google Wallet" is a signed JWT (RS256) referencing the object.
 *  - Updates are done via REST PATCH on the object — Google propagates to
 *    devices (no device push tokens to manage, unlike Apple).
 *
 * Auth to the REST API uses a service-account JWT bearer (OAuth2 assertion
 * grant), signed with the SA private key. All signing uses `jose` (already a
 * dependency), so no extra Google SDK is required.
 */
import { SignJWT, importPKCS8 } from 'jose'
import { getGoogleConfig, getWebServiceBaseUrl } from './config.js'
import { type PassData, DEFAULT_BRANDING } from './pass-data.js'

const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1'
const SAVE_ORIGIN_AUDIENCE = 'google'

/** classId is stable per program; objectId is stable per card. */
function classId(issuerId: string, programId: string): string {
  return `${issuerId}.program_${programId}`
}
function objectId(issuerId: string, cardId: string): string {
  return `${issuerId}.card_${cardId}`
}

async function importKey(pem: string) {
  // SA private keys are PKCS#8 ("-----BEGIN PRIVATE KEY-----").
  return importPKCS8(pem.replace(/\\n/g, '\n'), 'RS256')
}

/** Mint a short-lived OAuth2 access token for the Wallet REST API. */
async function getAccessToken(): Promise<string | null> {
  const cfg = getGoogleConfig()
  if (!cfg) return null
  const key = await importKey(cfg.privateKey)
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(cfg.clientEmail)
    .setSubject(cfg.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { access_token?: string }
  return json.access_token ?? null
}

/** Google must fetch images from a public absolute URL; resolve relative paths. */
export function absoluteImageUrl(url: string | undefined | null): string {
  const base = getWebServiceBaseUrl()
  if (!url) return `${base}/api/public/loyalty/default-logo.png`
  if (/^https?:\/\//i.test(url)) return url
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

export function buildClassPayload(data: PassData, issuerId: string, programId: string) {
  return {
    id: classId(issuerId, programId),
    issuerName: data.businessName,
    programName: data.programName,
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: data.branding.bgColor ?? DEFAULT_BRANDING.bgColor,
    // programLogo is REQUIRED by Google; fall back to a default logo.
    programLogo: { sourceUri: { uri: absoluteImageUrl(data.branding.logoUrl) } },
  }
}

export function buildObjectPayload(
  data: PassData,
  issuerId: string,
  programId: string,
  opts: { omitMessages?: boolean } = {},
) {
  const loyaltyPoints = {
    label: 'Puntos',
    balance: { int: data.points },
  }
  const messages = !opts.omitMessages && data.offer && data.offer.length > 0
    ? [{ id: 'offer', body: data.offer }]
    : []
  const textModulesData: Array<{ id: string; header: string; body: string }> = []
  if (data.rewardThreshold && data.rewardDescription) {
    textModulesData.push({
      id: 'reward',
      header: 'Recompensa',
      body: `${data.rewardDescription} (${data.rewardThreshold} puntos)`,
    })
  }
  return {
    id: objectId(issuerId, data.cardId),
    classId: classId(issuerId, programId),
    state: data.voided ? 'EXPIRED' : 'ACTIVE',
    accountName: data.customerName,
    accountId: data.cardId,
    loyaltyPoints,
    barcode: { type: 'QR_CODE', value: data.cardId, alternateText: data.serialNumber },
    ...(textModulesData.length > 0 ? { textModulesData } : {}),
    ...(messages.length > 0 ? { messages } : {}),
  }
}

async function apiRequest(method: string, path: string, token: string, body?: unknown) {
  return fetch(`${WALLET_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

async function failIfNotOk(res: Response, what: string) {
  if (res.ok) return
  const text = await res.text().catch(() => '')
  throw new Error(`Google Wallet: ${what} falló (${res.status}) ${text.slice(0, 300)}`)
}

/** Ensure the LoyaltyClass exists and is up to date (create or PATCH). */
async function ensureClass(data: PassData, issuerId: string, programId: string, token: string) {
  const payload = buildClassPayload(data, issuerId, programId)
  const getRes = await apiRequest('GET', `/loyaltyClass/${payload.id}`, token)
  if (getRes.status === 404) {
    await failIfNotOk(await apiRequest('POST', '/loyaltyClass', token, payload), 'crear clase')
  } else {
    await failIfNotOk(getRes, 'consultar clase')
    // Keep branding in sync (reviewStatus is left untouched on update).
    const { reviewStatus: _omit, ...patch } = payload
    await failIfNotOk(await apiRequest('PATCH', `/loyaltyClass/${payload.id}`, token, patch), 'actualizar clase')
  }
}

/**
 * Create the object (if needed) and return the "Add to Google Wallet" JWT link.
 * Throws if Google is not configured or the Google API rejects a request.
 */
export async function buildGoogleSaveUrl(data: PassData, programId: string): Promise<string> {
  const cfg = getGoogleConfig()
  if (!cfg) throw new Error('Google Wallet no está configurado (falta service account)')

  const token = await getAccessToken()
  if (!token) throw new Error('Google Wallet: no se pudo obtener access token (revisar service account)')
  await ensureClass(data, cfg.issuerId, programId, token)
  const obj = buildObjectPayload(data, cfg.issuerId, programId)
  const getRes = await apiRequest('GET', `/loyaltyObject/${obj.id}`, token)
  if (getRes.status === 404) {
    await failIfNotOk(await apiRequest('POST', '/loyaltyObject', token, obj), 'crear objeto')
  } else {
    await failIfNotOk(getRes, 'consultar objeto')
  }

  // The save JWT embeds the object by reference (id); class/object already exist
  // server-side. Signed with the SA key (RS256).
  const key = await importKey(cfg.privateKey)
  const claims = {
    iss: cfg.clientEmail,
    aud: SAVE_ORIGIN_AUDIENCE,
    typ: 'savetowallet',
    payload: {
      loyaltyObjects: [{ id: objectId(cfg.issuerId, data.cardId) }],
    },
  }
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .sign(key)

  return `https://pay.google.com/gp/v/save/${jwt}`
}

/**
 * PATCH the loyalty object to reflect new points / offer. Safe no-op if unconfigured.
 *
 * When `notify` is true and there is an offer, the offer is delivered with the
 * AddMessage API as TEXT_AND_NOTIFY (the only way to get a push on Android for
 * free text). Google caps this at 3 notifying messages per pass per 24h; if the
 * quota is exceeded we fall back to a plain TEXT message (updates, no push).
 */
export async function updateGoogleObject(
  data: PassData,
  programId: string,
  opts: { notify?: boolean } = {},
): Promise<boolean> {
  const cfg = getGoogleConfig()
  if (!cfg) return false
  const token = await getAccessToken()
  if (!token) return false
  const notify = !!opts.notify && !!data.offer && data.offer.length > 0
  const obj = buildObjectPayload(data, cfg.issuerId, programId, { omitMessages: notify })
  const res = await apiRequest('PATCH', `/loyaltyObject/${obj.id}`, token, obj)
  // 404 = the customer never saved the pass to Google Wallet; not an error.
  if (!res.ok) {
    if (res.status !== 404) {
      console.warn(`[google-wallet] PATCH objeto falló (${res.status})`, (await res.text().catch(() => '')).slice(0, 300))
    }
    return false
  }
  if (notify) await addOfferMessage(obj.id, data.offer as string, token)
  return true
}

/** AddMessage with notification; degrades to TEXT when the 24h quota is hit. */
async function addOfferMessage(objectIdFull: string, offer: string, token: string) {
  const id = `offer_${Date.now()}`
  for (const messageType of ['TEXT_AND_NOTIFY', 'TEXT'] as const) {
    const res = await apiRequest('POST', `/loyaltyObject/${objectIdFull}/addMessage`, token, {
      message: { id, body: offer, messageType },
    })
    if (res.ok) return
    const text = (await res.text().catch(() => '')).slice(0, 300)
    console.warn(`[google-wallet] addMessage ${messageType} falló (${res.status})`, text)
    // Only retry as plain TEXT when the failure is the notification quota.
    if (!(messageType === 'TEXT_AND_NOTIFY' && /quota/i.test(text))) return
  }
}
