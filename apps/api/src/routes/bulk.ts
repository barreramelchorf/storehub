import type { FastifyInstance } from 'fastify'
import { db, products, categories } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    if (values.every(v => !v.trim())) continue // skip empty rows
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function parseBoolean(val: string | undefined, defaultVal: boolean): boolean {
  if (!val || val === '') return defaultVal
  const lower = val.toLowerCase().trim()
  if (['true', '1', 'si', 'sí', 'yes'].includes(lower)) return true
  if (['false', '0', 'no'].includes(lower)) return false
  return defaultVal
}

interface ProductRow {
  line: number
  name: string
  category: string
  price: number
  stock: number
  minStock: number
  description: string | null
  active: boolean
  visible: boolean
}

interface ValidationError {
  line: number
  field: string
  message: string
}

export async function bulkRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Template download
  app.get('/api/admin/bulk/template', { preHandler: requirePermission('inventory.manage') }, async (_request, reply) => {
    const template = `name,category,price,stock,min_stock,description,active,visible
Café Americano,Bebidas calientes,45.00,100,10,Café de grano molido,true,true
Cappuccino,Bebidas calientes,65.00,80,10,Espresso con leche espumada,true,true
Croissant,Alimentos,40.00,20,3,Croissant de mantequilla,true,true
Agua mineral,Bebidas frías,25.00,50,5,,true,true
Topping de fresa,Extras,10.00,200,20,Solo para uso interno,true,false`

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="productos_template.csv"')
    // BOM for Excel UTF-8 compatibility
    return '\ufeff' + template
  })

  // Bulk products upload
  app.post('/api/admin/bulk/products', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const tenantId = request.tenant.id

    // Get CSV content from multipart or JSON body
    let csvText: string

    const contentType = request.headers['content-type'] ?? ''
    if (contentType.includes('multipart')) {
      const file = await request.file()
      if (!file) return reply.code(400).send({ error: 'No file uploaded' })
      const buffer = await file.toBuffer()
      csvText = buffer.toString('utf-8')
      // Strip BOM if present
      if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1)
    } else {
      const body = request.body as { csv?: string }
      if (!body.csv) return reply.code(400).send({ error: 'csv field is required' })
      csvText = body.csv
    }

    // Parse CSV
    const rows = parseCsv(csvText)
    if (rows.length === 0) {
      return reply.code(400).send({ error: 'CSV is empty or has no data rows' })
    }
    if (rows.length > 5000) {
      return reply.code(400).send({ error: 'Maximum 5000 rows per upload' })
    }

    // Validate required headers
    const requiredHeaders = ['name', 'category', 'price']
    const firstRow = rows[0]
    const missingHeaders = requiredHeaders.filter(h => !(h in firstRow))
    if (missingHeaders.length > 0) {
      return reply.code(400).send({ error: `Missing required columns: ${missingHeaders.join(', ')}. Required: name, category, price` })
    }

    // Validate and parse all rows
    const validRows: ProductRow[] = []
    const errors: ValidationError[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const line = i + 2 // +2 because line 1 is header, data starts at line 2

      if (!row.name) { errors.push({ line, field: 'name', message: 'Name is required' }); continue }
      if (!row.category) { errors.push({ line, field: 'category', message: 'Category is required' }); continue }

      const price = Number(row.price)
      if (!row.price || isNaN(price) || price < 0) { errors.push({ line, field: 'price', message: 'Price must be a positive number' }); continue }

      const stock = row.stock ? Number(row.stock) : 0
      if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) { errors.push({ line, field: 'stock', message: 'Stock must be a non-negative integer' }); continue }

      const minStock = row.min_stock ? Number(row.min_stock) : 0
      if (isNaN(minStock) || minStock < 0 || !Number.isInteger(minStock)) { errors.push({ line, field: 'min_stock', message: 'Min stock must be a non-negative integer' }); continue }

      validRows.push({
        line,
        name: row.name,
        category: row.category,
        price,
        stock,
        minStock,
        description: row.description || null,
        active: parseBoolean(row.active, true),
        visible: parseBoolean(row.visible, true),
      })
    }

    if (errors.length > 0 && validRows.length === 0) {
      return reply.code(400).send({ error: 'All rows have errors', errors })
    }

    // Check for mode: preview vs confirm
    const mode = (request.query as { mode?: string }).mode ?? 'preview'

    if (mode === 'preview') {
      // Return parsed data and errors for user review
      const categoryNames = [...new Set(validRows.map(r => r.category))]
      const existingCategories = await db.query.categories.findMany({
        where: (c, { eq, and }) => and(eq(c.tenantId, tenantId)),
        columns: { id: true, name: true },
      })
      const existingNames = existingCategories.map(c => c.name.toLowerCase())
      const newCategories = categoryNames.filter(n => !existingNames.includes(n.toLowerCase()))

      return {
        mode: 'preview',
        totalRows: rows.length,
        validRows: validRows.length,
        errors,
        newCategories,
        existingCategories: categoryNames.filter(n => existingNames.includes(n.toLowerCase())),
        products: validRows.map(r => ({ name: r.name, category: r.category, price: r.price, stock: r.stock, minStock: r.minStock, description: r.description, active: r.active, visible: r.visible })),
      }
    }

    // Confirm mode: actually insert
    // 1. Resolve or create categories
    const existingCats = await db.query.categories.findMany({
      where: (c, { eq }) => eq(c.tenantId, tenantId),
      columns: { id: true, name: true },
    })
    const catMap = new Map(existingCats.map(c => [c.name.toLowerCase(), c.id]))

    const uniqueCategories = [...new Set(validRows.map(r => r.category))]
    for (const catName of uniqueCategories) {
      if (!catMap.has(catName.toLowerCase())) {
        const [created] = await db.insert(categories).values({ tenantId, name: catName }).returning()
        catMap.set(catName.toLowerCase(), created.id)
      }
    }

    // 2. Bulk insert products
    const productValues = validRows.map(r => ({
      tenantId,
      categoryId: catMap.get(r.category.toLowerCase())!,
      name: r.name,
      description: r.description,
      price: String(r.price),
      stock: r.stock,
      minStock: r.minStock,
      active: r.active,
      visible: r.visible,
    }))

    const inserted = await db.insert(products).values(productValues).returning()

    return reply.code(201).send({
      mode: 'confirm',
      created: inserted.length,
      categoriesCreated: uniqueCategories.filter(n => !existingCats.some(c => c.name.toLowerCase() === n.toLowerCase())).length,
      errors,
    })
  })
}
