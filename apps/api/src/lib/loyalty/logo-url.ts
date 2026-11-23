/**
 * Safe handling of `branding.logoUrl` (program / store logo).
 *
 * The API downloads this URL server-side to build the Apple pass. The field is writable
 * by store admins, so an arbitrary URL would let them make the API fetch ANY address
 * (internal cluster services, cloud metadata, a server that answers with a hostile
 * payload such as the Brotli bug Node2Shell, CVE-2026-111497). Only images hosted by the
 * platform itself (the loyalty web-service origin) are allowed.
 */

/**
 * Resolve `url` against the platform base URL and return it ONLY if it is hosted on the
 * platform origin (same scheme, host and port, no credentials). Relative paths such as
 * `/api/public/storage/logo.png` are accepted. Anything else returns null.
 */
export function resolveAllowedLogoUrl(url: string | undefined | null, baseUrl: string): string | null {
  const raw = (url ?? '').trim()
  if (!raw) return null
  let base: URL
  let resolved: URL
  try {
    base = new URL(baseUrl)
    // Protocol-relative ("//host/x") and backslash tricks ("/\host") are re-checked below
    // by comparing the origin AFTER resolution.
    resolved = new URL(raw, base)
  } catch {
    return null
  }
  if (resolved.protocol !== base.protocol) return null
  if (resolved.origin !== base.origin) return null
  if (resolved.username || resolved.password) return null
  return resolved.href
}

/** Spanish validation message for the admin routes, or null when the logo URL is acceptable. */
export function logoUrlProblem(url: string | undefined | null, baseUrl: string): string | null {
  if (!url || !url.trim()) return null
  return resolveAllowedLogoUrl(url, baseUrl)
    ? null
    : 'El logo debe estar alojado en la plataforma (usa una imagen subida a StoreHub, no un enlace externo).'
}

export const MAX_LOGO_BYTES = 2 * 1024 * 1024
export const LOGO_FETCH_TIMEOUT_MS = 5000

/**
 * Download a logo from the platform origin. Returns null on any problem (not allowed,
 * redirect, non-image, too large, timeout, network error): callers fall back to a placeholder.
 */
export async function fetchLogoBuffer(
  url: string | undefined | null,
  opts: { baseUrl: string; fetchImpl?: typeof fetch; maxBytes?: number; timeoutMs?: number },
): Promise<Buffer | null> {
  const safe = resolveAllowedLogoUrl(url, opts.baseUrl)
  if (!safe) return null
  const { fetchImpl = fetch, maxBytes = MAX_LOGO_BYTES, timeoutMs = LOGO_FETCH_TIMEOUT_MS } = opts
  try {
    const res = await fetchImpl(safe, {
      redirect: 'error', // a redirect could send us to a non-platform address
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'accept-encoding': 'identity', accept: 'image/*' },
    })
    if (!res.ok) return null
    if (!/^image\//i.test(res.headers.get('content-type') ?? '')) return null
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.byteLength > maxBytes ? null : buf
  } catch {
    return null
  }
}
