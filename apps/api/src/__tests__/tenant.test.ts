import { describe, it, expect } from 'vitest'

describe('Tenant Resolution Logic', () => {
  const platformDomain = 'storehub.local'

  function extractSlug(host: string): string | null {
    const lower = host.toLowerCase()
    if (lower.endsWith(`.${platformDomain}`)) {
      return lower.slice(0, lower.length - platformDomain.length - 1)
    }
    return null
  }

  it('extracts slug from subdomain', () => {
    expect(extractSlug('demo-cafe.storehub.local')).toBe('demo-cafe')
    expect(extractSlug('techcell.storehub.local')).toBe('techcell')
  })

  it('returns null for custom domains', () => {
    expect(extractSlug('misupertienda.com')).toBeNull()
    expect(extractSlug('localhost')).toBeNull()
  })

  it('handles case insensitivity', () => {
    expect(extractSlug('Demo-Cafe.storehub.local')).toBe('demo-cafe')
  })
})
