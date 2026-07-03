// Tenant
export type GiroType = 'cafeteria' | 'electronics' | 'bakery' | 'restaurant' | 'other'

export interface Tenant {
  id: string
  slug: string
  customDomain: string | null
  name: string
  giro: GiroType
  config: TenantConfig
  createdAt: Date
}

export interface TenantConfig {
  branding: { logoUrl?: string; primaryColor: string; secondaryColor: string }
  contact: { address?: string; phone?: string; whatsapp?: string; email?: string; hours?: string }
  social: { instagram?: string; facebook?: string; tiktok?: string; website?: string }
  modules: { pos: boolean; inventory: boolean; analytics: boolean; multicomanda: boolean }
  meta: { title?: string; description?: string; ogImage?: string }
}

// User & Auth
export type Permission =
  | 'sales.create'
  | 'sales.view'
  | 'sales.override_price'
  | 'sales.backdate'
  | 'inventory.view'
  | 'inventory.manage'
  | 'inventory.restock'
  | 'analytics.view'
  | 'audit.view'
  | 'settings.manage'
  | 'users.manage'
  | 'documents.manage'

export interface Role {
  id: string
  tenantId: string
  name: string
  permissions: Permission[]
  isDefault: boolean
}

export interface User {
  id: string
  tenantId: string
  email: string
  roleId: string
  active: boolean
  createdAt: Date
}

// Catalog
export interface Category {
  id: string
  tenantId: string
  name: string
  description: string | null
  imageUrl: string | null
  sortOrder: number
  active: boolean
}

export interface Product {
  id: string
  tenantId: string
  categoryId: string
  name: string
  description: string | null
  price: number
  images: string[]
  stock: number
  minStock: number
  active: boolean
  visible: boolean
  createdAt: Date
}

// Sales
export type SaleStatus = 'approved' | 'pending_approval' | 'rejected'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'

export interface Sale {
  id: string
  tenantId: string
  userId: string
  total: number
  discount: number
  tip: number
  paymentMethod: PaymentMethod
  notes: string | null
  status: SaleStatus
  saleDate: Date
  createdAt: Date
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  quantity: number
  unitPrice: number
  originalPrice: number
  overrideReason: string | null
  subtotal: number
}

// Documents
export interface Document {
  id: string
  tenantId: string
  name: string
  slug: string
  filePath: string
  active: boolean
  createdAt: Date
}

// Audit
export interface AuditLog {
  id: string
  tenantId: string
  userId: string
  eventType: string
  entityType: string
  entityId: string
  payload: { before?: unknown; after?: unknown; [key: string]: unknown }
  createdAt: Date
}
