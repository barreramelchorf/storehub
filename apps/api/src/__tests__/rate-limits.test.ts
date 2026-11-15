import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { createWindowLimiter, ipLimitHook, TRUST_PROXY } from '../lib/rate-limits.js'

describe('createWindowLimiter', () => {
  it('permite hasta max y bloquea el siguiente, con el tiempo restante', () => {
    let t = 1_000
    const l = createWindowLimiter({ max: 3, windowMs: 60_000, now: () => t })
    expect(l.hit('a').allowed).toBe(true)
    expect(l.hit('a').allowed).toBe(true)
    expect(l.hit('a').allowed).toBe(true)
    t += 10_000
    const blocked = l.hit('a')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(50_000)
  })

  it('las claves son independientes', () => {
    const l = createWindowLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    expect(l.hit('a').allowed).toBe(true)
    expect(l.hit('a').allowed).toBe(false)
    expect(l.hit('b').allowed).toBe(true)
  })

  it('la ventana se reinicia al vencer y los bloqueos no la extienden', () => {
    let t = 0
    const l = createWindowLimiter({ max: 1, windowMs: 1000, now: () => t })
    l.hit('a')
    t = 900
    expect(l.hit('a').allowed).toBe(false) // bloqueado, no mueve el vencimiento
    t = 1000
    expect(l.hit('a').allowed).toBe(true)
  })

  it('acota la memoria con muchas claves distintas', () => {
    const l = createWindowLimiter({ max: 5, windowMs: 60_000, now: () => 0, maxKeys: 100 })
    for (let i = 0; i < 1000; i++) l.hit(`ip-${i}`)
    // no truena y sigue funcionando para claves nuevas
    expect(l.hit('nueva').allowed).toBe(true)
  })
})

describe('trustProxy (servidor Fastify real)', () => {
  async function ipSeenBy(remoteAddress: string, headers: Record<string, string> = {}) {
    const app = Fastify({ trustProxy: TRUST_PROXY })
    app.get('/ip', async (req) => ({ ip: req.ip }))
    const res = await app.inject({ method: 'GET', url: '/ip', remoteAddress, headers })
    await app.close()
    return res.json().ip as string
  }

  it('por defecto confía solo en la red de pods de k3s', () => {
    expect(TRUST_PROXY).toBe('10.42.0.0/16')
  })

  it('desde Traefik (IP de pod) usa la IP real del X-Forwarded-For', async () => {
    expect(await ipSeenBy('10.42.0.224', { 'x-forwarded-for': '189.203.27.249' })).toBe('189.203.27.249')
  })

  it('sin X-Forwarded-For usa la IP del socket (sondeos del kubelet, SSR del web)', async () => {
    expect(await ipSeenBy('10.42.0.1')).toBe('10.42.0.1')
  })

  it('un cliente externo NO puede falsificar su IP con X-Forwarded-For', async () => {
    expect(await ipSeenBy('203.0.113.7', { 'x-forwarded-for': '1.2.3.4' })).toBe('203.0.113.7')
  })

  it('con una cadena, ignora los saltos de confianza y toma el cliente real', async () => {
    // cliente -> (otro proxy interno de confianza) -> Traefik
    expect(await ipSeenBy('10.42.0.224', { 'x-forwarded-for': '189.203.27.249, 10.42.0.9' })).toBe('189.203.27.249')
  })
})

describe('ipLimitHook', () => {
  it('responde 429 en español con retry-after tras superar el límite, por IP', async () => {
    const app = Fastify({ trustProxy: TRUST_PROXY })
    const limiter = createWindowLimiter({ max: 2, windowMs: 60_000 })
    app.post('/login', { onRequest: ipLimitHook(limiter) }, async () => ({ ok: true }))
    const call = (ip: string) =>
      app.inject({ method: 'POST', url: '/login', remoteAddress: '10.42.0.224', headers: { 'x-forwarded-for': ip } })

    expect((await call('198.51.100.1')).statusCode).toBe(200)
    expect((await call('198.51.100.1')).statusCode).toBe(200)
    const blocked = await call('198.51.100.1')
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().message).toMatch(/^Demasiados intentos desde tu red\. Intenta de nuevo en \d+ (segundos?|minutos?)\.$/)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    // otra IP no se ve afectada
    expect((await call('198.51.100.2')).statusCode).toBe(200)
    await app.close()
  })
})
