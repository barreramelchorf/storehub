/**
 * Google Wallet loyalty pass generation and updates.
 *
 * Model:
 *  - One LoyaltyClass per program. Created on first "Add to Google Wallet"; updated only by
 *    syncGoogleClass (program save + API startup), never while a customer saves a card.
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
import type { ProgramPassData } from './pass-builder.js'

/** What the class needs: program-level content only (no card). */
type ClassData = Pick<ProgramPassData, 'programName' | 'businessName' | 'branding'>

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

export function buildClassPayload(data: ClassData, issuerId: string, programId: string) {
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

/**
 * Make sure the LoyaltyClass exists. Used by "Add to Google Wallet": it creates the class
 * when missing and NEVER updates an existing one (Google's samples do the same), so a
 * class-sync problem can't stop a customer from saving a card. Updates live in
 * syncGoogleClass, run when a program is saved and at API startup.
 */
async function ensureClassExists(data: ClassData, issuerId: string, programId: string, token: string) {
  const payload = buildClassPayload(data, issuerId, programId)
  const getRes = await apiRequest('GET', `/loyaltyClass/${payload.id}`, token)
  if (getRes.status === 404) {
    await failIfNotOk(await apiRequest('POST', '/loyaltyClass', token, payload), 'crear clase')
    return
  }
  await failIfNotOk(getRes, 'consultar clase')
}

/**
 * Body for updating an existing class. Google requires reviewStatus UNDER_REVIEW (or
 * DRAFT) on every update; omitting it re-validates the stored APPROVED and fails with
 * 400 "Invalid review status APPROVED. Use UNDER_REVIEW instead."
 * (see google-wallet/rest-samples, demo-loyalty.js: updateClass / patchClass).
 */
export function buildClassPatch(payload: ReturnType<typeof buildClassPayload>) {
  return { ...payload, reviewStatus: 'UNDER_REVIEW' as const }
}

/** Fields of the class we own; anything else in Google's copy is left alone. */
export function classFieldsDiffer(
  current: { issuerName?: string; programName?: string; hexBackgroundColor?: string; programLogo?: { sourceUri?: { uri?: string } } },
  desired: ReturnType<typeof buildClassPayload>,
): string[] {
  const diffs: string[] = []
  if ((current.issuerName ?? '') !== desired.issuerName) diffs.push('issuerName')
  if ((current.programName ?? '') !== desired.programName) diffs.push('programName')
  if ((current.hexBackgroundColor ?? '').toLowerCase() !== desired.hexBackgroundColor.toLowerCase()) diffs.push('hexBackgroundColor')
  if ((current.programLogo?.sourceUri?.uri ?? '') !== desired.programLogo.sourceUri.uri) diffs.push('programLogo')
  return diffs
}

export type ClassSyncResult =
  | { status: 'skipped'; reason: string }
  | { status: 'created' }
  | { status: 'unchanged' }
  | { status: 'updated'; fields: string[] }

/**
 * Bring the program's LoyaltyClass in line with the program: GET it, create it if
 * missing, PATCH (with UNDER_REVIEW) only the fields that changed. Throws on Google errors;
 * callers decide whether that matters (program save does not fail because of it).
 */
export async function syncGoogleClass(programId: string): Promise<ClassSyncResult> {
  const cfg = getGoogleConfig()
  if (!cfg) return { status: 'skipped', reason: 'Google Wallet no configurado' }
  // Lazy: keep this module loadable without a database (payload builders are unit-tested).
  const { loadProgramPassData } = await import('./pass-builder.js')
  const data = await loadProgramPassData(programId)
  if (!data) return { status: 'skipped', reason: 'programa no encontrado' }
  const token = await getAccessToken()
  if (!token) throw new Error('Google Wallet: no se pudo obtener access token (revisar service account)')

  const desired = buildClassPayload(data, cfg.issuerId, programId)
  const getRes = await apiRequest('GET', `/loyaltyClass/${desired.id}`, token)
  if (getRes.status === 404) {
    await failIfNotOk(await apiRequest('POST', '/loyaltyClass', token, desired), 'crear clase')
    return { status: 'created' }
  }
  await failIfNotOk(getRes, 'consultar clase')
  const fields = classFieldsDiffer(await getRes.json(), desired)
  if (fields.length === 0) return { status: 'unchanged' }
  await failIfNotOk(await apiRequest('PATCH', `/loyaltyClass/${desired.id}`, token, buildClassPatch(desired)), 'actualizar clase')
  return { status: 'updated', fields }
}

type Logger = { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }

/** Sync one program's class, logging the outcome. Never throws (program save must not fail). */
export async function syncGoogleClassSafely(programId: string, log: Logger): Promise<void> {
  try {
    const result = await syncGoogleClass(programId)
    if (result.status !== 'skipped' && result.status !== 'unchanged') {
      log.info({ programId, ...result }, 'google wallet: clase sincronizada')
    }
  } catch (err) {
    log.error({ err, programId }, 'google wallet: no se pudo sincronizar la clase')
  }
}

/**
 * Sync the classes of every program of tenants with the loyalty add-on on. Run once at
 * API startup so changes made outside the program form (store name/colors) or while
 * Google was down get applied. Idempotent: unchanged classes are not touched.
 */
export async function syncAllGoogleClasses(log: Logger): Promise<void> {
  if (!getGoogleConfig()) return
  const { db } = await import('@storehub/db')
  const tenants = await db.query.tenants.findMany({ columns: { id: true, config: true } })
  const enabled = new Set(tenants.filter((t) => (t.config as any)?.modules?.loyalty === true).map((t) => t.id))
  if (enabled.size === 0) return
  const programs = await db.query.loyaltyPrograms.findMany({ columns: { id: true, tenantId: true } })
  for (const p of programs) {
    if (enabled.has(p.tenantId)) await syncGoogleClassSafely(p.id, log)
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
  await ensureClassExists(data, cfg.issuerId, programId, token)
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
