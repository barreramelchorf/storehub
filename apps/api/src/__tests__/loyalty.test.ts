import { describe, it, expect } from 'vitest'
import {
  businessDate,
  canEarnToday,
  hasReachedReward,
  pointsToReward,
} from '../lib/loyalty/scan-logic.js'
import { hexToRgb } from '../lib/loyalty/pass-data.js'
import { normalizeMxPhone, loyaltyEnrollSchema, loyaltyScanSchema } from '@storehub/schemas'

// Pure-function tests mirroring the project style (no DB/HTTP). These guard the
// loyalty earning rules (1 scan/day), reward math, and color conversion.

describe('Loyalty — canEarnToday (maxScansPerDay configurable)', () => {
  it('allows the first scan of the day (default cap 1)', () => {
    expect(canEarnToday(0, 1)).toBe(true)
  })

  it('blocks a second scan the same day with cap 1', () => {
    expect(canEarnToday(1, 1)).toBe(false)
  })

  it('allows up to N scans/day when cap is N', () => {
    expect(canEarnToday(0, 3)).toBe(true)
    expect(canEarnToday(2, 3)).toBe(true)
    expect(canEarnToday(3, 3)).toBe(false)
  })

  it('cap 0 = unlimited (always allows)', () => {
    expect(canEarnToday(0, 0)).toBe(true)
    expect(canEarnToday(99, 0)).toBe(true)
  })
})

describe('Loyalty — reward math', () => {
  it('not reached when below threshold', () => {
    expect(hasReachedReward(9, 10)).toBe(false)
  })
  it('reached when equal to threshold', () => {
    expect(hasReachedReward(10, 10)).toBe(true)
  })
  it('reached when above threshold', () => {
    expect(hasReachedReward(12, 10)).toBe(true)
  })
  it('never reached when no threshold configured', () => {
    expect(hasReachedReward(100, null)).toBe(false)
    expect(hasReachedReward(100, 0)).toBe(false)
  })

  it('pointsToReward counts down correctly', () => {
    expect(pointsToReward(3, 10)).toBe(7)
  })
  it('pointsToReward is 0 once reached', () => {
    expect(pointsToReward(10, 10)).toBe(0)
    expect(pointsToReward(15, 10)).toBe(0)
  })
  it('pointsToReward is 0 with no threshold', () => {
    expect(pointsToReward(5, null)).toBe(0)
  })
})

describe('Loyalty — businessDate format', () => {
  it('returns YYYY-MM-DD', () => {
    expect(businessDate(new Date('2026-10-31T18:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('Loyalty — hexToRgb (Apple/Google color format)', () => {
  it('converts #RRGGBB to rgb(r, g, b)', () => {
    expect(hexToRgb('#1f2937')).toBe('rgb(31, 41, 55)')
  })
  it('handles hex without leading #', () => {
    expect(hexToRgb('ffffff')).toBe('rgb(255, 255, 255)')
  })
  it('falls back to a safe default on invalid input', () => {
    expect(hexToRgb('not-a-color')).toBe('rgb(31, 41, 55)')
  })
})

describe('Loyalty — Google Wallet payloads', () => {
  const data = {
    cardId: 'c1', serialNumber: 's1', authToken: 't', programName: 'Puntos', businessName: 'Cafe',
    points: 3, rewardThreshold: 10, rewardDescription: 'Café gratis', offer: null,
    customerName: 'Ana', branding: { logoUrl: '/api/public/storage/logo.png', bgColor: '#112233' },
  }
  it('class: logo relativo se vuelve absoluto y siempre hay programLogo', async () => {
    const { buildClassPayload } = await import('../lib/loyalty/google-pass.js')
    const c = buildClassPayload(data as any, 'ISS', 'p1')
    expect(c.id).toBe('ISS.program_p1')
    expect(c.programLogo.sourceUri.uri).toMatch(/^https?:\/\/.+\/api\/public\/storage\/logo\.png$/)
    const noLogo = buildClassPayload({ ...data, branding: {} } as any, 'ISS', 'p1')
    expect(noLogo.programLogo.sourceUri.uri).toMatch(/default-logo\.png$/)
  })
  it('object: puntos, recompensa y oferta', async () => {
    const { buildObjectPayload } = await import('../lib/loyalty/google-pass.js')
    const o = buildObjectPayload({ ...data, offer: '2x1' } as any, 'ISS', 'p1') as any
    expect(o.id).toBe('ISS.card_c1')
    expect(o.loyaltyPoints.balance.int).toBe(3)
    expect(o.textModulesData[0].body).toContain('10 puntos')
    expect(o.messages[0].body).toBe('2x1')
    const silent = buildObjectPayload({ ...data, offer: '2x1' } as any, 'ISS', 'p1', { omitMessages: true }) as any
    expect(silent.messages).toBeUndefined()
  })
})

describe('Loyalty — normalizeMxPhone (10 dígitos, solo México)', () => {
  it('acepta 10 dígitos limpios', () => {
    expect(normalizeMxPhone('5545783005')).toBe('5545783005')
  })
  it('limpia espacios, guiones y paréntesis', () => {
    expect(normalizeMxPhone('55 4578 3005')).toBe('5545783005')
    expect(normalizeMxPhone('(55) 4578-3005')).toBe('5545783005')
  })
  it('quita el prefijo de país +52 / 52 / 521', () => {
    expect(normalizeMxPhone('+52 55 4578 3005')).toBe('5545783005')
    expect(normalizeMxPhone('525545783005')).toBe('5545783005')
    expect(normalizeMxPhone('5215545783005')).toBe('5545783005')
  })
  it('rechaza números con longitud incorrecta o vacíos', () => {
    expect(normalizeMxPhone('554578300')).toBeNull()      // 9
    expect(normalizeMxPhone('55457830055')).toBeNull()    // 11
    expect(normalizeMxPhone('abcdefghij')).toBeNull()
    expect(normalizeMxPhone('')).toBeNull()
    expect(normalizeMxPhone(null)).toBeNull()
  })
})

describe('Loyalty — loyaltyEnrollSchema (correo y teléfono obligatorios)', () => {
  const base = { customerName: 'Ana', customerEmail: 'ana@ejemplo.com' }
  it('guarda el teléfono normalizado', () => {
    const r = loyaltyEnrollSchema.safeParse({ ...base, customerPhone: '55 4578 3005' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.customerPhone).toBe('5545783005')
  })
  it('rechaza si falta el teléfono', () => {
    expect(loyaltyEnrollSchema.safeParse(base).success).toBe(false)
    expect(loyaltyEnrollSchema.safeParse({ ...base, customerPhone: '' }).success).toBe(false)
  })
  it('rechaza teléfonos que no son de 10 dígitos', () => {
    const r = loyaltyEnrollSchema.safeParse({ ...base, customerPhone: '12345' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.errors[0].message).toMatch(/10 dígitos/)
  })
})

describe('Loyalty — loyaltyScanSchema (via)', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000'
  it("por defecto via = 'qr'", () => {
    const r = loyaltyScanSchema.parse({ cardId: id })
    expect(r.via).toBe('qr')
  })
  it("acepta via = 'phone' y rechaza otros valores", () => {
    expect(loyaltyScanSchema.parse({ cardId: id, via: 'phone' }).via).toBe('phone')
    expect(loyaltyScanSchema.safeParse({ cardId: id, via: 'otro' }).success).toBe(false)
  })
})
