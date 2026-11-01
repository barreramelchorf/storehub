import { pgTable, uuid, text, boolean, integer, numeric, jsonb, timestamp, date, pgEnum, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const giroEnum = pgEnum('giro_type', ['cafeteria', 'electronics', 'bakery', 'restaurant', 'other'])
export const saleStatusEnum = pgEnum('sale_status', ['approved', 'pending_approval', 'rejected', 'cancelled', 'pending_delete'])
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'card', 'transfer', 'other'])
export const cashSessionStatusEnum = pgEnum('cash_session_status', ['open', 'closed'])

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
  mustChangePassword: boolean('must_change_password').notNull().default(true),
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

// Cash Sessions (apertura/cierre de caja)
export const cashSessions = pgTable('cash_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  status: cashSessionStatusEnum('status').notNull().default('open'),
  openedBy: uuid('opened_by').notNull().references(() => users.id),
  openedAt: timestamp('opened_at').notNull().defaultNow(),
  openingFloat: numeric('opening_float', { precision: 10, scale: 2 }).notNull(),
  closedBy: uuid('closed_by').references(() => users.id),
  closedAt: timestamp('closed_at'),
  closingCount: numeric('closing_count', { precision: 10, scale: 2 }),
  expectedCash: numeric('expected_cash', { precision: 10, scale: 2 }),
  difference: numeric('difference', { precision: 10, scale: 2 }),
  cashSales: numeric('cash_sales', { precision: 10, scale: 2 }),
  cardSales: numeric('card_sales', { precision: 10, scale: 2 }),
  transferSales: numeric('transfer_sales', { precision: 10, scale: 2 }),
  otherSales: numeric('other_sales', { precision: 10, scale: 2 }),
  businessDate: text('business_date').notNull(), // YYYY-MM-DD in business tz
  lateClose: boolean('late_close').notNull().default(false),
}, (t) => [
  index('cash_sessions_tenant_status_idx').on(t.tenantId, t.status),
  index('cash_sessions_tenant_date_idx').on(t.tenantId, t.businessDate),
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
  cashSessionId: uuid('cash_session_id').references(() => cashSessions.id),
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
  modifiers: jsonb('modifiers').notNull().default([]),
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
  contentHash: text('content_hash'),
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

// Modifier Groups
export const modifierGroups = pgTable('modifier_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  required: boolean('required').notNull().default(false),
  multiple: boolean('multiple').notNull().default(true),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('modifier_groups_tenant_idx').on(t.tenantId)])

// Modifier Options
export const modifierOptions = pgTable('modifier_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => modifierGroups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('modifier_options_group_idx').on(t.groupId)])

// Product ↔ Modifier Group (many-to-many)
export const productModifierGroups = pgTable('product_modifier_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => modifierGroups.id, { onDelete: 'cascade' }),
}, (t) => [
  unique('product_modifier_groups_unique').on(t.productId, t.groupId),
  index('product_modifier_groups_product_idx').on(t.productId),
])

// Category ↔ Modifier Group (many-to-many, products inherit from category)
export const categoryModifierGroups = pgTable('category_modifier_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => modifierGroups.id, { onDelete: 'cascade' }),
}, (t) => [
  unique('category_modifier_groups_unique').on(t.categoryId, t.groupId),
  index('category_modifier_groups_category_idx').on(t.categoryId),
])

// Campaign type enum
export const campaignTypeEnum = pgEnum('campaign_type', ['nxm', 'percentage'])

// Campaigns (offer campaigns: NxM, percentage discount)
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: campaignTypeEnum('type').notNull(),
  // config jsonb: for nxm { buy: 3, pay: 2 }, for percentage { percent: 20 }
  config: jsonb('config').notNull().default({}),
  // daysOfWeek: array of 0-6 (0=Sunday). Empty = all days.
  daysOfWeek: jsonb('days_of_week').notNull().default([]),
  active: boolean('active').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('campaigns_tenant_idx').on(t.tenantId)])

// Campaign ↔ Product (many-to-many)
export const campaignProducts = pgTable('campaign_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
}, (t) => [
  unique('campaign_products_unique').on(t.campaignId, t.productId),
  index('campaign_products_campaign_idx').on(t.campaignId),
])

// Campaign ↔ Category (many-to-many)
export const campaignCategories = pgTable('campaign_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (t) => [
  unique('campaign_categories_unique').on(t.campaignId, t.categoryId),
  index('campaign_categories_campaign_idx').on(t.campaignId),
])

// ─── Loyalty (Apple/Google Wallet passes) ───────────────────────────────────
// Módulo INDEPENDIENTE del POS. Un tenant puede tener solo lealtad, solo POS, o ambos.
// No depende de la tabla `sales`. Gateado por config.modules.loyalty (default false).

export const loyaltyPlatformEnum = pgEnum('loyalty_platform', ['apple', 'google', 'unknown'])
export const loyaltyCardStatusEnum = pgEnum('loyalty_card_status', ['active', 'blocked'])
export const loyaltyTxTypeEnum = pgEnum('loyalty_tx_type', ['earn', 'redeem', 'adjust'])
export const loyaltyCampaignStatusEnum = pgEnum('loyalty_campaign_status', ['pending', 'sending', 'sent', 'failed'])

// Loyalty Programs (uno por tenant en v1)
export const loyaltyPrograms = pgTable('loyalty_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  pointsPerVisit: integer('points_per_visit').notNull().default(1),
  // Points granted once when a customer enrolls (0 = start empty). Configurable
  // because some businesses want the card to start with a visit, others at zero.
  welcomePoints: integer('welcome_points').notNull().default(1),
  rewardThreshold: integer('reward_threshold'),
  rewardDescription: text('reward_description'),
  // branding jsonb: { logoUrl, bgColor, fgColor, labelColor }
  branding: jsonb('branding').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('loyalty_programs_tenant_idx').on(t.tenantId),
])

// Loyalty Cards (una por cliente inscrito)
export const loyaltyCards = pgTable('loyalty_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  programId: uuid('program_id').notNull().references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  birthDate: date('birth_date'),
  points: integer('points').notNull().default(0),
  totalVisits: integer('total_visits').notNull().default(0),
  serialNumber: text('serial_number').notNull().unique(),
  authToken: text('auth_token').notNull(),
  platform: loyaltyPlatformEnum('platform').notNull().default('unknown'),
  status: loyaltyCardStatusEnum('status').notNull().default('active'),
  lastScanAt: timestamp('last_scan_at'),
  // Advances on ANY pass-visible change (scan, redeem, adjust, campaign). Used
  // as the Apple web service `lastUpdated` tag so iOS reliably detects updates.
  passUpdatedAt: timestamp('pass_updated_at').notNull().defaultNow(),
  // Current offer message shown on the pass (set by campaigns, cleared on expiry).
  // Persisted so the device's pass pull includes it (not just the campaign run).
  currentOffer: text('current_offer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('loyalty_cards_tenant_idx').on(t.tenantId),
  index('loyalty_cards_serial_idx').on(t.serialNumber),
  index('loyalty_cards_tenant_phone_idx').on(t.tenantId, t.customerPhone),
  index('loyalty_cards_program_email_idx').on(t.programId, t.customerEmail),
])

// Loyalty Transactions (log de movimientos de puntos, auditoría)
export const loyaltyTransactions = pgTable('loyalty_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  cardId: uuid('card_id').notNull().references(() => loyaltyCards.id, { onDelete: 'cascade' }),
  type: loyaltyTxTypeEnum('type').notNull(),
  points: integer('points').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  performedBy: uuid('performed_by').references(() => users.id),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('loyalty_transactions_card_idx').on(t.cardId),
  index('loyalty_transactions_tenant_idx').on(t.tenantId),
])

// Apple Pass Registrations (dispositivos para push, requerido por el web service de Apple)
export const applePassRegistrations = pgTable('apple_pass_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').notNull().references(() => loyaltyCards.id, { onDelete: 'cascade' }),
  deviceLibraryId: text('device_library_id').notNull(),
  pushToken: text('push_token').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  unique('apple_pass_registrations_unique').on(t.cardId, t.deviceLibraryId),
  index('apple_pass_registrations_card_idx').on(t.cardId),
])

// Loyalty Campaigns (campañas de oferta -> actualizan el campo "Oferta" del pase)
export const loyaltyCampaigns = pgTable('loyalty_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  programId: uuid('program_id').notNull().references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  expiresAt: timestamp('expires_at'),
  status: loyaltyCampaignStatusEnum('status').notNull().default('pending'),
  targetCount: integer('target_count').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('loyalty_campaigns_tenant_status_idx').on(t.tenantId, t.status),
])

// Loyalty Recovery Tokens (single-use, 30-min links to recover an existing card
// when a returning user re-enrolls with an email that already has a card).
export const loyaltyRecoveryTokens = pgTable('loyalty_recovery_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  cardId: uuid('card_id').notNull().references(() => loyaltyCards.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('loyalty_recovery_tokens_token_idx').on(t.token),
  index('loyalty_recovery_tokens_card_idx').on(t.cardId),
])

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}))

export const salesRelations = relations(sales, ({ many, one }) => ({
  items: many(saleItems),
  user: one(users, { fields: [sales.userId], references: [users.id] }),
}))

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
}))

export const modifierGroupsRelations = relations(modifierGroups, ({ many }) => ({
  options: many(modifierOptions),
  productLinks: many(productModifierGroups),
  categoryLinks: many(categoryModifierGroups),
}))

export const modifierOptionsRelations = relations(modifierOptions, ({ one }) => ({
  group: one(modifierGroups, { fields: [modifierOptions.groupId], references: [modifierGroups.id] }),
}))

export const productModifierGroupsRelations = relations(productModifierGroups, ({ one }) => ({
  product: one(products, { fields: [productModifierGroups.productId], references: [products.id] }),
  group: one(modifierGroups, { fields: [productModifierGroups.groupId], references: [modifierGroups.id] }),
}))

export const categoryModifierGroupsRelations = relations(categoryModifierGroups, ({ one }) => ({
  category: one(categories, { fields: [categoryModifierGroups.categoryId], references: [categories.id] }),
  group: one(modifierGroups, { fields: [categoryModifierGroups.groupId], references: [modifierGroups.id] }),
}))

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  productLinks: many(campaignProducts),
  categoryLinks: many(campaignCategories),
}))

export const campaignProductsRelations = relations(campaignProducts, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignProducts.campaignId], references: [campaigns.id] }),
  product: one(products, { fields: [campaignProducts.productId], references: [products.id] }),
}))

export const campaignCategoriesRelations = relations(campaignCategories, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignCategories.campaignId], references: [campaigns.id] }),
  category: one(categories, { fields: [campaignCategories.categoryId], references: [categories.id] }),
}))

// Loyalty relations
export const loyaltyProgramsRelations = relations(loyaltyPrograms, ({ many }) => ({
  cards: many(loyaltyCards),
  campaigns: many(loyaltyCampaigns),
}))

export const loyaltyCardsRelations = relations(loyaltyCards, ({ one, many }) => ({
  program: one(loyaltyPrograms, { fields: [loyaltyCards.programId], references: [loyaltyPrograms.id] }),
  transactions: many(loyaltyTransactions),
  registrations: many(applePassRegistrations),
}))

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  card: one(loyaltyCards, { fields: [loyaltyTransactions.cardId], references: [loyaltyCards.id] }),
  performer: one(users, { fields: [loyaltyTransactions.performedBy], references: [users.id] }),
}))

export const applePassRegistrationsRelations = relations(applePassRegistrations, ({ one }) => ({
  card: one(loyaltyCards, { fields: [applePassRegistrations.cardId], references: [loyaltyCards.id] }),
}))

export const loyaltyCampaignsRelations = relations(loyaltyCampaigns, ({ one }) => ({
  program: one(loyaltyPrograms, { fields: [loyaltyCampaigns.programId], references: [loyaltyPrograms.id] }),
  creator: one(users, { fields: [loyaltyCampaigns.createdBy], references: [users.id] }),
}))
