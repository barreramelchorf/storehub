const SERVER_API_URL = process.env.API_URL ?? 'http://localhost:3001'
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

type FetchOptions = RequestInit & { token?: string; host?: string }

export async function api<T = any>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, headers, host, ...rest } = opts
  const isServer = typeof window === 'undefined'
  const url = isServer ? `${SERVER_API_URL}${path}` : `${CLIENT_API_URL}${path}`

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(isServer && host && { 'x-forwarded-host': host }),
      ...(!isServer && { 'x-tenant-slug': window.location.hostname.split('.')[0] === 'localhost' ? 'demo-cafe' : window.location.hostname.split('.')[0] }),
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
