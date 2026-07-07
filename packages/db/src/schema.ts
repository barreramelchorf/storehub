import { pgTable, uuid, text, boolean, integer, numeric, jsonb, timestamp, pgEnum, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const giroEnum = pgEnum('giro_type', ['cafeteria', 'electronics', 'bakery', 'restaurant', 'other'])
export const saleStatusEnum = pgEnum('sale_status', ['approved', 'pending_approval', 'rejected', 'cancelled', 'pending_delete'])
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'card', 'transfer', 'other'])

// Tenants
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  customDomain: text('custom_domain').unique(),
  name: text('name').notNull(),
  giro: giroEnum('giro').notNull().default('other'),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Roles
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  permissions: jsonb('permissions').notNull().default([]),
  isDefault: boolean('is_default').notNull().default(false),
}, (t) => [index('roles_tenant_idx').on(t.tenantId)])

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  username: text('username'),
  passwordHash: text('password_hash').notNull(),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  unique('users_tenant_email_unique').on(t.tenantId, t.email),
  index('users_tenant_idx').on(t.tenantId),
])

// Categories
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [index('categories_tenant_idx').on(t.tenantId)])

// Products
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  images: jsonb('images').notNull().default([]),
  stock: integer('stock').notNull().default(0),
  minStock: integer('min_stock').notNull().default(0),
  active: boolean('active').notNull().default(true),
  visible: boolean('visible').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('products_tenant_idx').on(t.tenantId),
  index('products_category_idx').on(t.categoryId),
])

// Sales
export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 10, scale: 2 }).notNull().default('0'),
  tip: numeric('tip', { precision: 10, scale: 2 }).notNull().default('0'),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  notes: text('notes'),
  status: saleStatusEnum('status').notNull().default('approved'),
  saleDate: timestamp('sale_date').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('sales_tenant_date_idx').on(t.tenantId, t.saleDate),
  index('sales_status_idx').on(t.status),
])

// Sale Items
export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric('original_price', { precision: 10, scale: 2 }).notNull(),
  overrideReason: text('override_reason'),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
}, (t) => [index('sale_items_product_idx').on(t.productId)])

// Sale Approvals
export const saleApprovals = pgTable('sale_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }).unique(),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  status: saleStatusEnum('status').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Documents
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  filePath: text('file_path').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  unique('documents_tenant_slug_unique').on(t.tenantId, t.slug),
  index('documents_tenant_idx').on(t.tenantId),
])

// Audit Log
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  eventType: text('event_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('audit_log_tenant_idx').on(t.tenantId),
  index('audit_log_created_idx').on(t.createdAt),
])

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}))

export const salesRelations = relations(sales, ({ many }) => ({
  items: many(saleItems),
}))

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
}))
