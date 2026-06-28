const SERVER_API_URL = process.env.API_URL ?? 'http://localhost:3001'
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

type FetchOptions = RequestInit & { token?: string; host?: string }

export async function api<T = any>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, headers, host, ...rest } = opts
  const isServer = typeof window === 'undefined'
  const url = isServer ? `${SERVER_API_URL}${path}` : `${CLIENT_API_URL}${path}`

  // Resolve tenant slug from host
  const resolveSlug = (h: string) => {
    const hostname = h.split(':')[0]
    const parts = hostname.split('.')
    // If it's a subdomain (e.g. demo-cafe.storehub.local), use first part
    if (parts.length > 1 && parts[0] !== 'www') return parts[0]
    // Fallback for localhost or direct access
    return process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo-cafe'
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(isServer && host && { 'x-forwarded-host': host }),
      ...(isServer && host && { 'x-tenant-slug': resolveSlug(host) }),
      ...(!isServer && { 'x-tenant-slug': window.location.hostname.split('.')[0] === 'localhost' ? (process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo-cafe') : window.location.hostname.split('.')[0] }),
      ...headers,
    },
    credentials: 'include',
    ...rest,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? 'Request failed')
  }
  return res.json()
}
