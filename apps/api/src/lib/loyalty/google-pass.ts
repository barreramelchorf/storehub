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
import { getGoogleConfig } from './config.js'
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

function buildClassPayload(data: PassData, issuerId: string, programId: string) {
  return {
    id: classId(issuerId, programId),
    issuerName: data.businessName,
    programName: data.programName,
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: data.branding.bgColor ?? DEFAULT_BRANDING.bgColor,
    ...(data.branding.logoUrl
      ? { programLogo: { sourceUri: { uri: data.branding.logoUrl } } }
      : {}),
  }
}

function buildObjectPayload(data: PassData, issuerId: string, programId: string) {
  const loyaltyPoints = {
    label: 'Puntos',
    balance: { int: data.points },
  }
  const messages = data.offer && data.offer.length > 0
    ? [{ header: 'Oferta', body: data.offer }]
    : []
  return {
    id: objectId(issuerId, data.cardId),
    classId: classId(issuerId, programId),
    state: 'ACTIVE',
    accountName: data.customerName,
    accountId: data.cardId,
    loyaltyPoints,
    barcode: { type: 'QR_CODE', value: data.cardId, alternateText: data.serialNumber },
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

/** Ensure the LoyaltyClass exists (idempotent create-or-get). */
async function ensureClass(data: PassData, issuerId: string, programId: string, token: string) {
  const payload = buildClassPayload(data, issuerId, programId)
  const getRes = await apiRequest('GET', `/loyaltyClass/${payload.id}`, token)
  if (getRes.status === 404) {
    await apiRequest('POST', '/loyaltyClass', token, payload)
  }
}

/**
 * Create the object (if needed) and return the "Add to Google Wallet" JWT link.
 * Throws if Google is not configured — callers should check isGoogleConfigured().
 */
export async function buildGoogleSaveUrl(data: PassData, programId: string): Promise<string> {
  const cfg = getGoogleConfig()
  if (!cfg) throw new Error('Google Wallet no está configurado (falta service account)')

  const token = await getAccessToken()
  if (token) {
    await ensureClass(data, cfg.issuerId, programId, token)
    const obj = buildObjectPayload(data, cfg.issuerId, programId)
    const getRes = await apiRequest('GET', `/loyaltyObject/${obj.id}`, token)
    if (getRes.status === 404) {
      await apiRequest('POST', '/loyaltyObject', token, obj)
    }
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

/** PATCH the loyalty object to reflect new points / offer. Safe no-op if unconfigured. */
export async function updateGoogleObject(data: PassData, programId: string): Promise<boolean> {
  const cfg = getGoogleConfig()
  if (!cfg) return false
  const token = await getAccessToken()
  if (!token) return false
  const obj = buildObjectPayload(data, cfg.issuerId, programId)
  const res = await apiRequest('PATCH', `/loyaltyObject/${obj.id}`, token, obj)
  return res.ok
}
