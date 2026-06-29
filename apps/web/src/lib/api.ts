const SERVER_API_URL = process.env.API_URL ?? 'http://localhost:3001'
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

type FetchOptions = RequestInit & { token?: string; host?: string; _retry?: boolean }

// Token management callbacks (set by client-side layout)
let onTokenRefreshed: ((token: string) => void) | null = null
let onSessionExpired: (() => void) | null = null
let getToken: (() => string | null) | null = null

export function setAuthCallbacks(callbacks: { onRefreshed: (t: string) => void; onExpired: () => void; getToken: () => string | null }) {
  onTokenRefreshed = callbacks.onRefreshed
  onSessionExpired = callbacks.onExpired
  getToken = callbacks.getToken
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${CLIENT_API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) return null
      const { accessToken } = await res.json()
      onTokenRefreshed?.(accessToken)
      return accessToken
    } catch { return null }
    finally { refreshPromise = null }
  })()
  return refreshPromise
}

export async function api<T = any>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, headers, host, _retry, ...rest } = opts
  const isServer = typeof window === 'undefined'
  const url = isServer ? `${SERVER_API_URL}${path}` : `${CLIENT_API_URL}${path}`

  const resolveSlug = (h: string) => {
    const hostname = h.split(':')[0]
    const parts = hostname.split('.')
    if (parts.length > 1 && parts[0] !== 'www') return parts[0]
    return process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo-cafe'
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(isServer && host && { 'x-forwarded-host': host }),
      ...(isServer && host && { 'x-tenant-slug': resolveSlug(host) }),
      ...(!isServer && (() => {
        // Check URL path for /t/:slug/ pattern
        const pathMatch = window.location.pathname.match(/^\/t\/([a-z0-9-]+)/)
        if (pathMatch) return { 'x-tenant-slug': pathMatch[1] }
        // Check hostname for subdomain
        const parts = window.location.hostname.split('.')
        const slug = parts.length > 2 && !['storehub', 'www'].includes(parts[0]) ? parts[0] : undefined
        return slug ? { 'x-tenant-slug': slug } : {}
      })()),
      ...headers,
    },
    credentials: 'include',
    ...rest,
  })

  // 401 interceptor (client-side only)
  if (res.status === 401 && !isServer && !_retry && token) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      return api(path, { ...opts, token: newToken, _retry: true })
    }
    onSessionExpired?.()
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? 'Request failed')
  }
  return res.json()
}
