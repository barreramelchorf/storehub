/**
 * Rate-limit policy for the API, in one place.
 *
 * Context: behind Traefik, `request.ip` is the proxy's pod IP for EVERY external
 * client (no `trustProxy` yet — see TECH_DEBT B7), so a per-IP counter is effectively
 * one counter shared by all users. These limits are therefore:
 *  - generous where traffic is legitimately high (public store, images, wallet pulls),
 *  - keyed by ACCOUNT (not IP) for login, so one person's attempts never lock out others.
 */
import type { FastifyRequest } from 'fastify'

/** Default for every route (shared counter: keep it high; it's only a flood safety net). */
export const GENERAL_LIMIT = { max: 600, timeWindow: '1 minute' } as const

/** Public images/files served by the API: a store page can request dozens at once. */
export const STORAGE_LIMIT = { max: 3000, timeWindow: '1 minute' } as const

/** Apple Wallet web service: after a campaign, every device pulls 2-3 times at once. */
export const APPLE_WS_LIMIT = { max: 2000, timeWindow: '1 minute' } as const

/** Login attempts per ACCOUNT (tenant + username/email), success or failure. */
export const LOGIN_LIMIT = { max: 10, timeWindow: '15 minutes' } as const

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
