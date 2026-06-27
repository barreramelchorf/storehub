import { db, tenants, roles, users, categories, products } from './index'
import { hashSync } from '../../../node_modules/bcryptjs/index.js'

async function seed() {
  console.log('🌱 Seeding...')

  // Demo tenant
  const [tenant] = await db.insert(tenants).values({
    slug: 'demo-cafe',
    name: 'Café Demo',
    giro: 'cafeteria',
    config: {
      branding: { primaryColor: '#6F4E37', secondaryColor: '#D4A574' },
      contact: { address: 'Calle Principal 123', phone: '+52 555 0000', hours: 'Lun-Vie 8am-6pm' },
      social: {},
      modules: { pos: true, inventory: true, analytics: true },
      meta: { title: 'Café Demo' },
    },
  }).returning()

  // Admin role
  const [adminRole] = await db.insert(roles).values({
    tenantId: tenant.id,
    name: 'admin',
    permissions: ['sales.create','sales.view','sales.override_price','sales.backdate','inventory.view','inventory.manage','analytics.view','audit.view','settings.manage','users.manage','documents.manage'],
    isDefault: true,
  }).returning()

  // Manager role
  await db.insert(roles).values({
    tenantId: tenant.id,
    name: 'manager',
    permissions: ['sales.create','sales.view','sales.override_price','sales.backdate','inventory.view','inventory.manage','analytics.view','audit.view','documents.manage'],
    isDefault: true,
  })

  // Cashier role
  await db.insert(roles).values({
    tenantId: tenant.id,
    name: 'cashier',
    permissions: ['sales.create'],
    isDefault: true,
  })

  // Admin user
  await db.insert(users).values({
    tenantId: tenant.id,
    email: 'admin@demo-cafe.com',
    passwordHash: hashSync('password123', 10),
    roleId: adminRole.id,
  })

  // Categories
  const [hotDrinks] = await db.insert(categories).values({ tenantId: tenant.id, name: 'Bebidas calientes', sortOrder: 1 }).returning()
  const [coldDrinks] = await db.insert(categories).values({ tenantId: tenant.id, name: 'Bebidas frías', sortOrder: 2 }).returning()
  const [food] = await db.insert(categories).values({ tenantId: tenant.id, name: 'Alimentos', sortOrder: 3 }).returning()

  // Products
  await db.insert(products).values([
    { tenantId: tenant.id, categoryId: hotDrinks.id, name: 'Café Americano', price: '45', stock: 100, minStock: 10 },
    { tenantId: tenant.id, categoryId: hotDrinks.id, name: 'Cappuccino', price: '65', stock: 100, minStock: 10 },
    { tenantId: tenant.id, categoryId: hotDrinks.id, name: 'Latte', price: '70', stock: 100, minStock: 10 },
    { tenantId: tenant.id, categoryId: coldDrinks.id, name: 'Frappuccino', price: '80', stock: 50, minStock: 5 },
    { tenantId: tenant.id, categoryId: coldDrinks.id, name: 'Agua mineral', price: '25', stock: 30, minStock: 5 },
    { tenantId: tenant.id, categoryId: food.id, name: 'Croissant', price: '40', stock: 20, minStock: 3 },
    { tenantId: tenant.id, categoryId: food.id, name: 'Muffin de arándano', price: '45', stock: 15, minStock: 3 },
    // Topping interno (activo pero no visible en tienda)
    { tenantId: tenant.id, categoryId: food.id, name: 'Topping de fresa', price: '10', stock: 200, minStock: 20, visible: false },
  ])

  console.log('✅ Seed complete')
  console.log(`   Tenant: demo-cafe`)
  console.log(`   Admin:  admin@demo-cafe.com / password123`)
  process.exit(0)
}

seed().catch((e) => { console.error(e); process.exit(1) })
