import type { FastifyInstance } from 'fastify'
import { db, productModifierGroups, categoryModifierGroups } from '@storehub/db'
import { asc, sql } from 'drizzle-orm'

export async function publicRoutes(app: FastifyInstance) {
  app.get('/api/public/products', async (request) => {
    const { category, search, page = '1', pageSize = '200' } = request.query as Record<string, string>
    const tenantId = request.tenant.id
    const limit = Math.min(Number(pageSize), 500)
    const offset = (Number(page) - 1) * limit

    const items = await db.query.products.findMany({
      where: (p, { eq, and }) => {
        const conditions = [eq(p.tenantId, tenantId), eq(p.active, true), eq(p.visible, true)]
        if (category) conditions.push(eq(p.categoryId, category))
        if (search) conditions.push(sql`unaccent(${p.name}) ILIKE unaccent(${`%${search}%`})`)
        return and(...conditions)
      },
      limit, offset, orderBy: (p) => [asc(p.name)],
    })

    // Add hasModifiers flag
    const productIds = items.map(p => p.id)
    const categoryIds = [...new Set(items.map(p => p.categoryId))]
    const prodLinks = productIds.length > 0 ? await db.query.productModifierGroups.findMany({ where: (pmg, { inArray }) => inArray(pmg.productId, productIds), columns: { productId: true } }) : []
    const catLinks = categoryIds.length > 0 ? await db.query.categoryModifierGroups.findMany({ where: (cmg, { inArray }) => inArray(cmg.categoryId, categoryIds), columns: { categoryId: true } }) : []
    const prodsWithMods = new Set(prodLinks.map(l => l.productId))
    const catsWithMods = new Set(catLinks.map(l => l.categoryId))

    return { items: items.map(p => ({ ...p, hasModifiers: prodsWithMods.has(p.id) || catsWithMods.has(p.categoryId) })), page: Number(page), pageSize: limit }
  })

  // Public endpoint to get modifiers for a product (used by public store cart)
  app.get('/api/public/products/:productId/modifiers', async (request) => {
    const { productId } = request.params as { productId: string }
    const product = await db.query.products.findFirst({ where: (p, { eq }) => eq(p.id, productId), columns: { categoryId: true } })

    const productLinks = await db.query.productModifierGroups.findMany({ where: (pmg, { eq }) => eq(pmg.productId, productId), with: { group: { with: { options: true } } } })
    const categoryLinks = product ? await db.query.categoryModifierGroups.findMany({ where: (cmg, { eq }) => eq(cmg.categoryId, product.categoryId), with: { group: { with: { options: true } } } }) : []

    const allLinks = [...productLinks, ...categoryLinks]
    const seen = new Set<string>()
    return allLinks.filter(l => { if (seen.has(l.group.id)) return false; seen.add(l.group.id); return true })
      .filter(l => l.group.active)
      .map(l => ({ ...l.group, options: l.group.options.filter(o => o.active).sort((a, b) => a.sortOrder - b.sortOrder) }))
  })

  app.get('/api/public/info', async (request) => {
    const t = request.tenant
    return { name: t.name, giro: t.giro, config: t.config }
  })

  app.get('/api/public/categories', async (request) => {
    return db.query.categories.findMany({
      where: (c, { eq, and }) => and(eq(c.tenantId, request.tenant.id), eq(c.active, true)),
      orderBy: (c) => [asc(c.sortOrder)],
    })
  })

  app.get('/:slug.pdf', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const doc = await db.query.documents.findFirst({
      where: (d, { eq, and }) => and(eq(d.tenantId, request.tenant.id), eq(d.slug, slug), eq(d.active, true)),
    })
    if (!doc) return reply.code(404).send({ error: 'Document not found' })
    const url = doc.contentHash ? `${doc.filePath}?v=${doc.contentHash}` : doc.filePath
    return reply.redirect(url)
  })

  app.get('/api/public/docs/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const doc = await db.query.documents.findFirst({
      where: (d, { eq, and }) => and(eq(d.tenantId, request.tenant.id), eq(d.slug, slug), eq(d.active, true)),
    })
    if (!doc) return reply.code(404).send({ error: 'Document not found' })
    const url = doc.contentHash ? `${doc.filePath}?v=${doc.contentHash}` : doc.filePath
    return reply.redirect(url)
  })

  // Serve any file from MinIO storage (images, etc)
  app.get('/api/public/storage/*', async (request, reply) => {
    const filePath = (request.params as any)['*']
    if (!filePath) return reply.code(400).send({ error: 'Path required' })

    const { minioClient, BUCKET } = await import('../plugins/storage.js')

    try {
      const stat = await minioClient.statObject(BUCKET, filePath)
      const stream = await minioClient.getObject(BUCKET, filePath)
      const contentType = stat.metaData?.['content-type'] ?? (filePath.endsWith('.webp') ? 'image/webp' : filePath.endsWith('.jpeg') || filePath.endsWith('.jpg') ? 'image/jpeg' : filePath.endsWith('.png') ? 'image/png' : filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
      reply.header('Content-Type', contentType)
      reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      return reply.send(stream)
    } catch (e: any) {
      return reply.code(404).send({ error: 'File not found' })
    }
  })

  // Serve PDF file directly (streamed from MinIO)
  app.get('/api/public/docs/:slug/file', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const doc = await db.query.documents.findFirst({
      where: (d, { eq, and }) => and(eq(d.tenantId, request.tenant.id), eq(d.slug, slug), eq(d.active, true)),
    })
    if (!doc) return reply.code(404).send({ error: 'Document not found' })

    const { minioClient, BUCKET } = await import('../plugins/storage.js')
    const filePath = `tenants/${request.tenant.id}/docs/${slug}.pdf`

    try {
      const stream = await minioClient.getObject(BUCKET, filePath)
      const etag = doc.contentHash ?? undefined
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="${slug}.pdf"`)
      if (etag) {
        reply.header('ETag', `"${etag}"`)
        // If client has same version, return 304
        const ifNoneMatch = request.headers['if-none-match']
        if (ifNoneMatch === `"${etag}"`) {
          return reply.code(304).send()
        }
      }
      return reply.send(stream)
    } catch (e: any) {
      return reply.code(404).send({ error: 'File not found in storage' })
    }
  })

  // Mercado Pago Checkout — creates a preference and returns the checkout URL
  app.post('/api/public/checkout', async (request, reply) => {
    const tenant = request.tenant
    const config = tenant.config as any
    const accessToken = config?.payments?.mercadoPagoAccessToken
    if (!accessToken) return reply.code(400).send({ error: 'Pagos en línea no configurados para esta tienda' })

    const { items, backUrl } = request.body as { items: Array<{ name: string; quantity: number; unitPrice: number; modifiers?: Array<{ name: string; price: number }> }>; backUrl: string }
    if (!items?.length) return reply.code(400).send({ error: 'items required' })

    // Build MP preference items
    const mpItems = items.map((item, idx) => {
      const modifiersText = item.modifiers?.length ? ` (${item.modifiers.map(m => m.name).join(', ')})` : ''
      return {
        id: `item-${idx}`,
        title: `${item.name}${modifiersText}`,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: 'MXN',
      }
    })

    try {
      const { MercadoPagoConfig, Preference } = await import('mercadopago')
      const client = new MercadoPagoConfig({ accessToken })
      const preference = new Preference(client)

      const backUrls = {
        success: `${backUrl}/checkout/success`,
        failure: `${backUrl}/checkout/failure`,
        pending: `${backUrl}/checkout/pending`,
      }
      request.log.debug({ backUrls, backUrl, itemCount: mpItems.length }, '[checkout] Creating MP preference')

      const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? ''
      const webhookUrl = `https://${host}/api/webhooks/mercadopago`

      const result = await preference.create({
        body: {
          items: mpItems,
          back_urls: backUrls,
          auto_return: 'approved',
          statement_descriptor: tenant.name,
          external_reference: JSON.stringify({ tenantId: tenant.id, items: items }),
          notification_url: webhookUrl,
        },
      })

      request.log.debug({ checkoutUrl: result.init_point, preferenceId: result.id, backUrls }, '[checkout] Preference created')
      return { checkoutUrl: result.init_point, preferenceId: result.id }
    } catch (e: any) {
      console.error('[mercadopago] Error creating preference:', e.message)
      return reply.code(500).send({ error: 'Error al crear el pago. Verifica tu Access Token de Mercado Pago.' })
    }
  })
}
