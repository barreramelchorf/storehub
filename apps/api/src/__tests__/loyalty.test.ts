import { describe, it, expect } from 'vitest'
import {
  businessDate,
  canEarnToday,
  hasReachedReward,
  pointsToReward,
  countScansOnBusinessDay,
} from '../lib/loyalty/scan-logic.js'
import { hexToRgb } from '../lib/loyalty/pass-data.js'
import { normalizeMxPhone, loyaltyEnrollSchema, loyaltyScanSchema, loyaltyRecoverRequestSchema } from '@storehub/schemas'
import { loginRateLimitKey, formatWait, GENERAL_LIMIT, LOGIN_LIMIT } from '../lib/rate-limits.js'
import {
  duplicateAction,
  welcomePointsFor,
  shouldSendRecovery,
  RECOVERY_COOLDOWN_MS,
  RECOVERY_MAX_PER_HOUR,
} from '../lib/loyalty/enroll-logic.js'

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

describe('Loyalty — duplicateAction (qué hacer si ya existe una tarjeta)', () => {
  it('sin tarjeta previa -> crear', () => {
    expect(duplicateAction(null)).toBe('create')
    expect(duplicateAction(undefined)).toBe('create')
  })
  it('tarjeta activa -> recuperar', () => {
    expect(duplicateAction('active')).toBe('recover')
  })
  it('tarjeta anulada -> puede registrarse de nuevo', () => {
    expect(duplicateAction('voided')).toBe('create')
  })
  it('tarjeta bloqueada -> rechazar (sin recuperación)', () => {
    expect(duplicateAction('blocked')).toBe('reject')
  })
})

describe('Loyalty — welcomePointsFor (no repetir bienvenida)', () => {
  it('da los puntos del programa a un cliente nuevo', () => {
    expect(welcomePointsFor(1, false)).toBe(1)
    expect(welcomePointsFor(5, false)).toBe(5)
  })
  it('no los repite si ya hubo una tarjeta anulada', () => {
    expect(welcomePointsFor(1, true)).toBe(0)
  })
  it('nunca devuelve negativos', () => {
    expect(welcomePointsFor(-3, false)).toBe(0)
  })
})

describe('Loyalty — shouldSendRecovery (cooldown y tope por tarjeta)', () => {
  const now = new Date('2026-11-15T12:00:00Z')
  it('permite el primer envío', () => {
    expect(shouldSendRecovery(null, 0, now)).toBe(true)
  })
  it('bloquea un segundo envío dentro del cooldown', () => {
    const last = new Date(now.getTime() - (RECOVERY_COOLDOWN_MS - 1000))
    expect(shouldSendRecovery(last, 1, now)).toBe(false)
  })
  it('permite otro envío pasado el cooldown', () => {
    const last = new Date(now.getTime() - (RECOVERY_COOLDOWN_MS + 1000))
    expect(shouldSendRecovery(last, 1, now)).toBe(true)
  })
  it('bloquea al llegar al tope por hora aunque haya pasado el cooldown', () => {
    const last = new Date(now.getTime() - (RECOVERY_COOLDOWN_MS + 1000))
    expect(shouldSendRecovery(last, RECOVERY_MAX_PER_HOUR, now)).toBe(false)
    expect(shouldSendRecovery(last, RECOVERY_MAX_PER_HOUR - 1, now)).toBe(true)
  })
})

describe('Loyalty — loyaltyRecoverRequestSchema (correo o celular)', () => {
  it('acepta solo correo', () => {
    expect(loyaltyRecoverRequestSchema.safeParse({ email: 'ana@ejemplo.com' }).success).toBe(true)
  })
  it('acepta solo celular y lo normaliza', () => {
    const r = loyaltyRecoverRequestSchema.safeParse({ phone: '55 4578 3005' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.phone).toBe('5545783005')
  })
  it('rechaza si no hay ni correo ni celular', () => {
    expect(loyaltyRecoverRequestSchema.safeParse({}).success).toBe(false)
    expect(loyaltyRecoverRequestSchema.safeParse({ phone: '' }).success).toBe(false)
  })
  it('rechaza un celular que no es de 10 dígitos', () => {
    const r = loyaltyRecoverRequestSchema.safeParse({ phone: '123' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.errors[0].message).toMatch(/10 dígitos/)
  })
})

describe('Loyalty — countScansOnBusinessDay (día de negocio = hora de México, no UTC)', () => {
  // México no tiene horario de verano desde 2022: UTC-6 todo el año.
  it('cuenta las visitas del mismo día de negocio', () => {
    const now = new Date('2026-11-14T20:00:00Z') // 14:00 del 14-nov en México
    const scans = [new Date('2026-11-14T15:00:00Z'), new Date('2026-11-14T18:30:00Z')]
    expect(countScansOnBusinessDay(scans, now)).toBe(2)
  })
  it('una visita de las 19:00 de México (ya es el día siguiente en UTC) cuenta como del mismo día', () => {
    const now = new Date('2026-11-15T05:30:00Z') // 23:30 del 14-nov en México
    const scans = [new Date('2026-11-15T01:00:00Z')] // 19:00 del 14-nov en México
    expect(countScansOnBusinessDay(scans, now)).toBe(1)
  })
  it('una visita de las 23:30 de México NO cuenta a la 01:00 del día siguiente', () => {
    const now = new Date('2026-11-15T07:00:00Z') // 01:00 del 15-nov en México
    const scans = [new Date('2026-11-15T05:30:00Z')] // 23:30 del 14-nov en México
    expect(countScansOnBusinessDay(scans, now)).toBe(0)
  })
  it('no cuenta visitas de días anteriores', () => {
    const now = new Date('2026-11-14T20:00:00Z')
    const scans = [new Date('2026-11-13T20:00:00Z'), new Date('2026-11-12T20:00:00Z')]
    expect(countScansOnBusinessDay(scans, now)).toBe(0)
  })
  it('sin visitas -> 0', () => {
    expect(countScansOnBusinessDay([], new Date())).toBe(0)
  })
})

describe('Rate limits — loginRateLimitKey (por cuenta, nunca por IP)', () => {
  const req = (body: unknown, tenant = 'demo-cafe') =>
    ({ body, headers: { 'x-tenant-slug': tenant }, hostname: 'storehub-staging.barreramelchorf.top' }) as any
  it('la misma cuenta produce la misma clave', () => {
    expect(loginRateLimitKey(req({ username: 'admin' }))).toBe(loginRateLimitKey(req({ username: 'admin' })))
  })
  it('cuentas distintas producen claves distintas (no se bloquean entre sí)', () => {
    expect(loginRateLimitKey(req({ username: 'ana' }))).not.toBe(loginRateLimitKey(req({ username: 'luis' })))
  })
  it('ignora mayúsculas y espacios', () => {
    expect(loginRateLimitKey(req({ username: '  Admin ' }))).toBe(loginRateLimitKey(req({ username: 'admin' })))
  })
  it('el mismo usuario en negocios distintos tiene claves distintas', () => {
    expect(loginRateLimitKey(req({ username: 'admin' }, 'xalli'))).not.toBe(loginRateLimitKey(req({ username: 'admin' }, 'demo-cafe')))
  })
  it('acepta correo en lugar de usuario y no revienta sin cuerpo', () => {
    expect(loginRateLimitKey(req({ email: 'A@B.com' }))).toContain('a@b.com')
    expect(loginRateLimitKey(req(undefined))).toContain(':anon')
  })
  it('la política: general alto, login por cuenta moderado', () => {
    expect(GENERAL_LIMIT.max).toBeGreaterThanOrEqual(600)
    expect(LOGIN_LIMIT.max).toBeGreaterThan(5)
  })
})

describe('Rate limits — formatWait (espera en español)', () => {
  it('segundos', () => {
    expect(formatWait(1000)).toBe('1 segundo')
    expect(formatWait(45000)).toBe('45 segundos')
  })
  it('minutos, redondeando hacia arriba', () => {
    expect(formatWait(60000)).toBe('1 minuto')
    expect(formatWait(61000)).toBe('2 minutos')
    expect(formatWait(15 * 60 * 1000)).toBe('15 minutos')
  })
  it('nunca devuelve 0', () => {
    expect(formatWait(0)).toBe('1 segundo')
    expect(formatWait(200)).toBe('1 segundo')
  })
})
