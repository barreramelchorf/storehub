import { describe, it, expect, vi } from 'vitest'
import { resolveAllowedLogoUrl, logoUrlProblem, fetchLogoBuffer, MAX_LOGO_BYTES } from '../lib/loyalty/logo-url.js'

const BASE = 'https://storehub.barreramelchorf.top'

describe('resolveAllowedLogoUrl', () => {
  it('acepta rutas relativas y URLs absolutas del propio origen', () => {
    expect(resolveAllowedLogoUrl('/api/public/storage/logo.png', BASE)).toBe(`${BASE}/api/public/storage/logo.png`)
    expect(resolveAllowedLogoUrl(`${BASE}/api/public/storage/a.png`, BASE)).toBe(`${BASE}/api/public/storage/a.png`)
  })

  it.each([
    ['otro dominio', 'https://evil.example/x.png'],
    ['IP interna', 'http://10.43.0.1/x.png'],
    ['metadatos de nube', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'http://localhost:3001/health'],
    ['servicio del cluster', 'http://api-svc.storehub-prod.svc.cluster.local:3001/health'],
    ['http contra base https', 'http://storehub.barreramelchorf.top/x.png'],
    ['subdominio parecido', 'https://storehub.barreramelchorf.top.evil.example/x.png'],
    ['prefijo parecido', 'https://evilstorehub.barreramelchorf.top/x.png'],
    ['otro puerto', 'https://storehub.barreramelchorf.top:8443/x.png'],
    ['credenciales en la URL', 'https://user:pw@storehub.barreramelchorf.top/x.png'],
    ['userinfo engañoso', 'https://storehub.barreramelchorf.top@evil.example/x.png'],
    ['protocolo relativo', '//evil.example/x.png'],
    ['barra invertida', '/\\evil.example/x.png'],
    ['javascript:', 'javascript:alert(1)'],
    ['file:', 'file:///etc/passwd'],
    ['data:', 'data:image/png;base64,AAAA'],
  ])('rechaza %s', (_name, url) => {
    expect(resolveAllowedLogoUrl(url, BASE)).toBeNull()
  })

  it('vacío o inválido da null', () => {
    expect(resolveAllowedLogoUrl('', BASE)).toBeNull()
    expect(resolveAllowedLogoUrl(undefined, BASE)).toBeNull()
    expect(resolveAllowedLogoUrl('   ', BASE)).toBeNull()
  })

  it('en desarrollo (http://localhost) acepta su propio origen', () => {
    expect(resolveAllowedLogoUrl('/api/public/storage/l.png', 'http://localhost')).toBe('http://localhost/api/public/storage/l.png')
    expect(resolveAllowedLogoUrl('https://localhost/x.png', 'http://localhost')).toBeNull()
  })
})

describe('logoUrlProblem', () => {
  it('sin logo no hay problema; con logo ajeno devuelve el mensaje en español', () => {
    expect(logoUrlProblem(undefined, BASE)).toBeNull()
    expect(logoUrlProblem('', BASE)).toBeNull()
    expect(logoUrlProblem('/api/public/storage/x.png', BASE)).toBeNull()
    expect(logoUrlProblem('https://evil.example/x.png', BASE)).toMatch(/alojado en la plataforma/)
  })
})

function pngResponse(body: Uint8Array, headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'image/png', ...headers } })
}

describe('fetchLogoBuffer', () => {
  it('NO hace ninguna petición a URLs que no son de la plataforma', async () => {
    const f = vi.fn()
    expect(await fetchLogoBuffer('https://evil.example/x.png', { baseUrl: BASE, fetchImpl: f as any })).toBeNull()
    expect(await fetchLogoBuffer('http://169.254.169.254/', { baseUrl: BASE, fetchImpl: f as any })).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('descarga del origen propio sin seguir redirecciones y pidiendo contenido sin comprimir', async () => {
    const f = vi.fn(async () => pngResponse(new Uint8Array([1, 2, 3])))
    const buf = await fetchLogoBuffer('/api/public/storage/l.png', { baseUrl: BASE, fetchImpl: f as any })
    expect(buf?.equals(Buffer.from([1, 2, 3]))).toBe(true)
    const [calledUrl, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe(`${BASE}/api/public/storage/l.png`)
    expect(init.redirect).toBe('error')
    expect((init.headers as Record<string, string>)['accept-encoding']).toBe('identity')
    expect(init.signal).toBeDefined()
  })

  it('rechaza respuestas que no son imagen, muy grandes, con error o que fallan', async () => {
    const mk = (fn: () => Promise<Response>) => fetchLogoBuffer('/x.png', { baseUrl: BASE, fetchImpl: fn as any })
    expect(await mk(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))).toBeNull()
    expect(await mk(async () => pngResponse(new Uint8Array(1), { 'content-length': String(MAX_LOGO_BYTES + 1) }))).toBeNull()
    expect(await mk(async () => pngResponse(new Uint8Array(MAX_LOGO_BYTES + 1)))).toBeNull()
    expect(await mk(async () => new Response('x', { status: 404, headers: { 'content-type': 'image/png' } }))).toBeNull()
    expect(await mk(async () => { throw new TypeError('redirect mode is set to error') })).toBeNull()
  })
})
