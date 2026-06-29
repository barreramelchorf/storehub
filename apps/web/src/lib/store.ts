'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEffect, useState } from 'react'

interface AuthState {
  token: string | null
  setToken: (token: string | null) => void
}

// Create a store per tenant slug
const stores: Record<string, ReturnType<typeof createAuthStore>> = {}

function createAuthStore(slug: string) {
  return create<AuthState>()(
    persist(
      (set) => ({ token: null, setToken: (token) => set({ token }) }),
      { name: `auth-${slug}` }
    )
  )
}

export function getAuthStore(slug: string) {
  if (!stores[slug]) stores[slug] = createAuthStore(slug)
  return stores[slug]
}

// Default store for backward compat
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({ token: null, setToken: (token) => set({ token }) }),
    { name: 'auth' }
  )
)

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])
  return hydrated
}

// Hook for use in tenant admin pages
export function useTenantToken(slug: string) {
  const store = getAuthStore(slug)
  return store(s => s.token)
}
