import { useAuthStore } from './store'

let refreshPromise: Promise<string | null> | null = null

function decodeJwt(token: string): { exp: number } | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload))
  } catch { return null }
}

export function isTokenExpired(token: string): boolean {
  const decoded = decodeJwt(token)
  if (!decoded) return true
  return decoded.exp * 1000 < Date.now()
}

export function tokenExpiresIn(token: string): number {
  const decoded = decodeJwt(token)
  if (!decoded) return 0
  return decoded.exp * 1000 - Date.now()
}

export async function refreshAccessToken(): Promise<string | null> {
  // Prevent multiple simultaneous refresh calls
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return null
      const { accessToken } = await res.json()
      useAuthStore.getState().setToken(accessToken)
      return accessToken
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function startProactiveRefresh() {
  const check = async () => {
    const token = useAuthStore.getState().token
    if (!token) return

    const expiresIn = tokenExpiresIn(token)
    // Refresh if token expires in less than 2 minutes
    if (expiresIn > 0 && expiresIn < 2 * 60 * 1000) {
      await refreshAccessToken()
    }
  }

  // Check every 60 seconds
  const interval = setInterval(check, 60 * 1000)
  return () => clearInterval(interval)
}
