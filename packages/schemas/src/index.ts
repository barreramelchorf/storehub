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
})

// Document
export const documentSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(100),
  active: z.boolean().default(true),
})

// User
export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().regex(/^[a-z0-9_-]*$/).optional(),
  password: passwordSchema,
  roleId: z.string().uuid(),
})

export const slugSchema = z.string().regex(/^[a-z0-9-]+$/).min(2).max(63)
