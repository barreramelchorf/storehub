import { z } from 'zod'

// Auth
export const passwordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un símbolo')

export const passwordRequirements = [
  { key: 'min', label: 'Mínimo 8 caracteres', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'Al menos una mayúscula', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Al menos una minúscula', test: (p: string) => /[a-z]/.test(p) },
  { key: 'number', label: 'Al menos un número', test: (p: string) => /[0-9]/.test(p) },
  { key: 'symbol', label: 'Al menos un símbolo (!@#$...)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Tenant
export const tenantConfigSchema = z.object({
  branding: z.object({
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  contact: z.object({
    address: z.string().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().email().optional(),
    hours: z.string().optional(),
  }),
  social: z.object({
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    tiktok: z.string().optional(),
    website: z.string().url().optional(),
  }),
  modules: z.object({
    pos: z.boolean(),
    inventory: z.boolean(),
    analytics: z.boolean(),
  }),
  meta: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.string().url().optional(),
  }),
})

// Category
export const categorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
})

// Product
export const productSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  price: z.number().positive(),
  images: z.array(z.string().url()).default([]),
  stock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  visible: z.boolean().default(true),
})

// Sale
export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  overrideReason: z.string().max(500).nullable().optional(),
  modifiers: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })).optional(),
})

export const saleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  discount: z.number().min(0).default(0),
  tip: z.number().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
  saleDate: z.string().datetime().optional(), // para ventas backdated
  onBehalfOfUserId: z.string().uuid().optional(), // cajero en turno (requiere users.manage)
})

// Document
export const documentSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(100),
  active: z.boolean().default(true),
})

// Edit past sale (admin/manager only) — only these fields are editable
export const saleEditSchema = z.object({
  tip: z.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']).optional(),
  userId: z.string().uuid().optional(), // cambiar cajero
  saleDate: z.string().datetime().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Nada que actualizar' })

// Campaign (offer campaigns: NxM, percentage)
export const campaignSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['nxm', 'percentage']),
  // nxm: { buy, pay } | percentage: { percent }
  config: z.union([
    z.object({ buy: z.number().int().min(2), pay: z.number().int().min(1) }),
    z.object({ percent: z.number().min(1).max(100) }),
  ]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  productIds: z.array(z.string().uuid()).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
}).refine(
  (d) => d.type === 'nxm'
    ? 'buy' in d.config && 'pay' in d.config && d.config.buy > d.config.pay
    : 'percent' in d.config,
  { message: 'Config inválida para el tipo de campaña (nxm requiere buy > pay; percentage requiere percent)' }
)

// User
export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().regex(/^[a-z0-9_-]*$/).optional(),
  password: passwordSchema,
  roleId: z.string().uuid(),
})

export const slugSchema = z.string().regex(/^[a-z0-9-]+$/).min(2).max(63)

// ─── Loyalty (Apple/Google Wallet) ──────────────────────────────────────────

// Public self-enrollment (cliente se auto-registra en la página pública)
export const loyaltyEnrollSchema = z.object({
  customerName: z.string().min(1, 'El nombre es requerido').max(120),
  customerEmail: z.string().email('Correo inválido').optional().or(z.literal('')),
  customerPhone: z.string().min(7, 'Teléfono inválido').max(20).optional().or(z.literal('')),
}).refine((d) => (d.customerEmail && d.customerEmail !== '') || (d.customerPhone && d.customerPhone !== ''), {
  message: 'Proporciona al menos un correo o un teléfono',
})

// Program config (admin)
export const loyaltyProgramSchema = z.object({
  name: z.string().min(1).max(100),
  active: z.boolean().default(true),
  pointsPerVisit: z.number().int().min(1).max(1000).default(1),
  rewardThreshold: z.number().int().min(1).max(100000).nullable().optional(),
  rewardDescription: z.string().max(300).nullable().optional(),
  branding: z.object({
    logoUrl: z.string().url().optional(),
    bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    fgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    labelColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).default({}),
})

// Scan a card (cajero) — the QR payload is the card id
export const loyaltyScanSchema = z.object({
  cardId: z.string().uuid('cardId inválido'),
})

// Manual points adjustment (admin) — note required for auditability
export const loyaltyAdjustSchema = z.object({
  points: z.number().int().refine((n) => n !== 0, { message: 'El ajuste no puede ser 0' }),
  note: z.string().min(1, 'La nota es requerida para ajustes manuales').max(300),
})

// Offer campaign (admin) — updates the "Oferta" field on all active cards
export const loyaltyCampaignSchema = z.object({
  message: z.string().min(1, 'El mensaje es requerido').max(200),
  expiresAt: z.string().datetime().nullable().optional(),
})
