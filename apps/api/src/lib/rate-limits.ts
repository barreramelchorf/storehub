/**
 * Rate-limit policy for the API, in one place.
 *
 * Client IP: Traefik (Service externalTrafficPolicy=Local, see
 * infra/infrastructure/traefik) forwards the REAL client IP in X-Forwarded-For. The API
 * trusts that header only when the TCP peer is inside the cluster pod network
 * (`TRUST_PROXY`), so `request.ip` is the real client IP for traffic coming through
 * Traefik and a spoofed header sent by anyone else is ignored.
 *
 * Policy:
 *  - general / storage / Apple web service: generous per-IP floods guards (legit traffic is high),
 *  - login: per ACCOUNT (10 / 15 min) plus a per-IP ceiling (30 / 15 min) against spraying,
 *  - public enrollment and recovery: per-IP caps against scripted mass registration.
 *    Customers on a shop's WiFi share one public IP, so these caps are not tight.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Which TCP peers may set X-Forwarded-For (CIDR list, comma separated). Default: the
 * k3s pod network, where Traefik runs. NEVER `true` (that would trust any client).
 */
export const TRUST_PROXY = process.env.TRUST_PROXY || '10.42.0.0/16'

/** Default for every route (per client IP): only a flood safety net. */
export const GENERAL_LIMIT = { max: 600, timeWindow: '1 minute' } as const

/** Public images/files served by the API: a store page can request dozens at once. */
export const STORAGE_LIMIT = { max: 3000, timeWindow: '1 minute' } as const

/** Apple Wallet web service: after a campaign, every device pulls 2-3 times at once. */
export const APPLE_WS_LIMIT = { max: 2000, timeWindow: '1 minute' } as const

/** Login attempts per ACCOUNT (tenant + username/email), success or failure. */
export const LOGIN_LIMIT = { max: 10, timeWindow: '15 minutes' } as const

/** Login attempts per client IP across ALL accounts (credential spraying). */
export const LOGIN_IP_LIMIT = { max: 30, windowMs: 15 * 60_000 } as const

/** Public card enrollment per client IP (a shop's WiFi shares one IP: keep it roomy). */
export const ENROLL_IP_LIMIT = { max: 60, timeWindow: '1 hour' } as const

/** Public "recover my card" requests per client IP. */
export const RECOVER_IP_LIMIT = { max: 30, timeWindow: '1 hour' } as const

/**
 * Human wait time in Spanish from the milliseconds left in the window
 * (e.g. 45000 -> "45 segundos", 125000 -> "3 minutos", 61000 -> "2 minutos").
 */
export function formatWait(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
}

/**
 * Rate-limit key for the login route. Uses the account being logged into, never the
 * IP. It runs at the `preHandler` hook (the body isn't parsed earlier).
 */
export function loginRateLimitKey(request: Pick<FastifyRequest, 'body' | 'headers' | 'hostname'>): string {
  const body = (request.body ?? {}) as { email?: unknown; username?: unknown }
  const who = String(body.username || body.email || '').trim().toLowerCase().slice(0, 120)
  const tenant = String(request.headers['x-tenant-slug'] || request.hostname || '').toLowerCase()
  return `login:${tenant}:${who || 'anon'}`
}

export interface WindowLimiter {
  /** Counts one hit for `key` and says whether it is still within the limit. */
  hit(key: string): { allowed: boolean; retryAfterMs: number }
}

/**
 * Fixed-window counter kept in memory (per API replica, like @fastify/rate-limit's
 * default store). The window starts at the first hit; blocked hits do not extend it.
 * The map is bounded so a flood of distinct keys cannot grow memory without limit.
 */
export function createWindowLimiter(opts: {
  max: number
  windowMs: number
  now?: () => number
  maxKeys?: number
}): WindowLimiter {
  const { max, windowMs, now = Date.now, maxKeys = 10_000 } = opts
  const entries = new Map<string, { count: number; resetAt: number }>()

  function prune(t: number) {
    for (const [k, e] of entries) if (e.resetAt <= t) entries.delete(k)
    // Still too many live keys: drop the oldest ones.
    for (const k of entries.keys()) {
      if (entries.size <= maxKeys) break
      entries.delete(k)
    }
  }

  return {
    hit(key) {
      const t = now()
      let e = entries.get(key)
      if (!e || e.resetAt <= t) {
        if (entries.size >= maxKeys) prune(t)
        e = { count: 0, resetAt: t + windowMs }
        entries.set(key, e)
      }
      e.count += 1
      return e.count > max
        ? { allowed: false, retryAfterMs: e.resetAt - t }
        : { allowed: true, retryAfterMs: 0 }
    },
  }
}

/** Fastify hook that rejects with a Spanish 429 once `request.ip` exceeds the limiter. */
export function ipLimitHook(limiter: WindowLimiter) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const r = limiter.hit(request.ip)
    if (r.allowed) return
    reply.header('retry-after', Math.ceil(r.retryAfterMs / 1000))
    return reply.code(429).send({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Demasiados intentos desde tu red. Intenta de nuevo en ${formatWait(r.retryAfterMs)}.`,
    })
  }
}
