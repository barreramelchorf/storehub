import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, exportPKCS8 } from 'jose'

// Google configured with a throwaway key; DB-backed program data is stubbed.
let privateKey = ''
vi.mock('../lib/loyalty/config.js', async (orig) => ({
  ...(await orig<typeof import('../lib/loyalty/config.js')>()),
  getGoogleConfig: () => ({ issuerId: 'ISS', clientEmail: 'sa@test.iam', privateKey }),
  getWebServiceBaseUrl: () => 'https://storehub.test',
}))
const programData = { programName: 'Café gratis', businessName: 'Xalli', branding: { bgColor: '#112233' } }
vi.mock('../lib/loyalty/pass-builder.js', () => ({
  loadProgramPassData: vi.fn(async (id: string) => (id === 'missing' ? null : programData)),
}))
vi.mock('@storehub/db', () => ({ db: {} }))

const { syncGoogleClass, syncGoogleClassSafely, classFieldsDiffer, buildClassPayload, buildGoogleSaveUrl } =
  await import('../lib/loyalty/google-pass.js')
const { resolveProgramPassData } = await vi.importActual<typeof import('../lib/loyalty/pass-builder.js')>('../lib/loyalty/pass-builder.js')

type Call = { method: string; url: string; body?: any }
let calls: Call[] = []
/** Fake Google: `classState` is what GET /loyaltyClass returns (null = 404). */
function fakeGoogle(classState: Record<string, unknown> | null, opts: { patchStatus?: number } = {}) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ method, url, body: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'tok' })
    if (url.includes('/loyaltyClass')) {
      if (method === 'GET') return classState ? Response.json(classState) : new Response('{}', { status: 404 })
      if (method === 'PATCH') {
        const status = opts.patchStatus ?? 200
        return new Response(status === 200 ? '{}' : '{"error":{"message":"Invalid review status"}}', { status })
      }
      return Response.json({})
    }
    if (url.includes('/loyaltyObject')) return method === 'GET' ? new Response('{}', { status: 404 }) : Response.json({})
    return new Response('not found', { status: 404 })
  }))
}
const classCalls = (m: string) => calls.filter((c) => c.url.includes('/loyaltyClass') && c.method === m)

beforeAll(async () => {
  const { privateKey: k } = await generateKeyPair('RS256', { extractable: true })
  privateKey = await exportPKCS8(k)
})
afterEach(() => vi.unstubAllGlobals())

const desired = () => buildClassPayload(programData as any, 'ISS', 'p1')
const approvedInSync = () => ({ ...desired(), reviewStatus: 'APPROVED' })

describe('classFieldsDiffer', () => {
  it('sin cambios no hay diferencias (color sin importar mayúsculas)', () => {
    expect(classFieldsDiffer({ ...desired(), hexBackgroundColor: '#112233'.toUpperCase() }, desired())).toEqual([])
  })
  it('detecta nombre, programa, color y logo', () => {
    expect(classFieldsDiffer({ ...desired(), issuerName: 'Otro', hexBackgroundColor: '#000000' }, desired()))
      .toEqual(['issuerName', 'hexBackgroundColor'])
    expect(classFieldsDiffer({}, desired())).toEqual(['issuerName', 'programName', 'hexBackgroundColor', 'programLogo'])
  })
})

describe('syncGoogleClass', () => {
  it('crea la clase si no existe', async () => {
    fakeGoogle(null)
    expect(await syncGoogleClass('p1')).toEqual({ status: 'created' })
    expect(classCalls('POST')).toHaveLength(1)
    expect(classCalls('PATCH')).toHaveLength(0)
  })
  it('no toca una clase aprobada que ya está al día', async () => {
    fakeGoogle(approvedInSync())
    expect(await syncGoogleClass('p1')).toEqual({ status: 'unchanged' })
    expect(classCalls('PATCH')).toHaveLength(0)
  })
  it('si cambió algo, PATCH con reviewStatus UNDER_REVIEW (requisito de Google)', async () => {
    fakeGoogle({ ...approvedInSync(), hexBackgroundColor: '#ffffff' })
    expect(await syncGoogleClass('p1')).toEqual({ status: 'updated', fields: ['hexBackgroundColor'] })
    const [patch] = classCalls('PATCH')
    expect(patch.body.reviewStatus).toBe('UNDER_REVIEW')
    expect(patch.body.hexBackgroundColor).toBe('#112233')
  })
  it('programa inexistente: no llama a Google', async () => {
    fakeGoogle(null)
    expect(await syncGoogleClass('missing')).toEqual({ status: 'skipped', reason: 'programa no encontrado' })
    expect(calls).toHaveLength(0)
  })
  it('syncGoogleClassSafely nunca lanza aunque Google rechace el PATCH', async () => {
    fakeGoogle({ ...approvedInSync(), programName: 'viejo' }, { patchStatus: 400 })
    const log = { info: vi.fn(), error: vi.fn() }
    await expect(syncGoogleClassSafely('p1', log)).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledOnce()
  })
})

describe('buildGoogleSaveUrl (botón "Agregar a Google Wallet")', () => {
  const pass = { ...programData, cardId: 'c1', serialNumber: 's1', authToken: 'tok-1234567890abcdef', points: 3, customerName: 'Ana', rewardThreshold: null, rewardDescription: null, offer: null, voided: false }
  it('con una clase aprobada y DESACTUALIZADA no la parcha y la tarjeta se agrega igual', async () => {
    // Exactly the incident: an approved class whose PATCH Google would reject.
    fakeGoogle({ ...approvedInSync(), programName: 'nombre viejo' }, { patchStatus: 400 })
    const url = await buildGoogleSaveUrl(pass as any, 'p1')
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//)
    expect(classCalls('PATCH')).toHaveLength(0)
    expect(calls.some((c) => c.url.endsWith('/loyaltyObject') && c.method === 'POST')).toBe(true)
  })
  it('si la clase no existe la crea antes de la tarjeta', async () => {
    fakeGoogle(null)
    await buildGoogleSaveUrl(pass as any, 'p1')
    expect(classCalls('POST')).toHaveLength(1)
    expect(classCalls('PATCH')).toHaveLength(0)
  })
})

describe('resolveProgramPassData', () => {
  it('el programa manda; si no, hereda de la tienda', () => {
    const r = resolveProgramPassData(
      { name: 'P', branding: { bgColor: '#010203' } },
      { name: 'Tienda', config: { branding: { primaryColor: '#999999', secondaryColor: '#888888', logoUrl: 'https://x/l.png' } } },
    )
    expect(r).toEqual({ programName: 'P', businessName: 'Tienda', branding: { bgColor: '#010203', fgColor: undefined, labelColor: '#888888', logoUrl: 'https://x/l.png' } })
    expect(resolveProgramPassData({ name: 'P', branding: null }, null).businessName).toBe('P')
  })
})

beforeEach(() => { calls = [] })
