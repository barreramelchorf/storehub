import type { FastifyInstance } from 'fastify'
import { db, products } from '@storehub/db'
import { eq, and } from 'drizzle-orm'
import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { minioClient, BUCKET, ensureBucket, getPublicUrl } from '../plugins/storage.js'

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.post('/api/admin/products/:id/image', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenantId = request.tenant.id

    // Verify product exists and belongs to tenant
    const product = await db.query.products.findFirst({
      where: (p, { eq, and }) => and(eq(p.id, id), eq(p.tenantId, tenantId)),
    })
    if (!product) return reply.code(404).send({ error: 'Product not found' })

    // Diagnostic logging (temporary) — capture what the browser sends
    request.log.info({
      contentType: request.headers['content-type'],
      userAgent: request.headers['user-agent'],
    }, '[upload] incoming image request')

    let file
    try {
      file = await request.file()
    } catch (e: any) {
      request.log.error({ err: e?.message, code: e?.code }, '[upload] request.file() threw')
      return reply.code(400).send({ error: `No se pudo leer el archivo: ${e?.message ?? 'error desconocido'}` })
    }
    if (!file) {
      request.log.warn('[upload] request.file() returned null')
      return reply.code(400).send({ error: 'Image file required' })
    }

    request.log.info({
      filename: file.filename,
      mimetype: file.mimetype,
      encoding: file.encoding,
    }, '[upload] file received')

    // Read buffer
    const chunks: Buffer[] = []
    for await (const chunk of file.file) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    if (file.file.truncated) {
      request.log.warn({ size: buffer.length }, '[upload] file was truncated (exceeded size limit)')
      return reply.code(400).send({ error: 'La imagen es demasiado grande' })
    }

    request.log.info({ bytes: buffer.length }, '[upload] buffer read')

    // Convert to WebP, resize to max 800px
    let processed: Buffer
    try {
      processed = await sharp(buffer)
        .rotate()
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()
    } catch (e: any) {
      request.log.error({ err: e?.message, mimetype: file.mimetype, filename: file.filename }, '[upload] sharp failed to process image')
      return reply.code(400).send({ error: `Formato de imagen no soportado (${file.mimetype}). Intenta con JPG o PNG.` })
    }

    // Upload to MinIO
    await ensureBucket()
    const filename = `${randomUUID()}.webp`
    const path = `tenants/${tenantId}/products/${filename}`
    await minioClient.putObject(BUCKET, path, processed, processed.length, { 'Content-Type': 'image/webp' })

    const imageUrl = getPublicUrl(path)

    // Remove old image(s) from MinIO
    const currentImages = (product.images as string[]) ?? []
    for (const oldUrl of currentImages) {
      try {
        const match = oldUrl.match(/\/api\/public\/storage\/(.+)$/) ?? oldUrl.match(/\/storehub\/(.+)$/)
        if (match) await minioClient.removeObject(BUCKET, match[1])
      } catch {}
    }

    // Replace all images with the new one
    const updatedImages = [imageUrl]

    await db.update(products)
      .set({ images: updatedImages })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))

    return { url: imageUrl, images: updatedImages }
  })

  // Remove product image
  app.delete('/api/admin/products/:id/image', { preHandler: requirePermission('inventory.manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenantId = request.tenant.id

    const product = await db.query.products.findFirst({
      where: (p, { eq, and }) => and(eq(p.id, id), eq(p.tenantId, tenantId)),
    })
    if (!product) return reply.code(404).send({ error: 'Product not found' })

    const currentImages = (product.images as string[]) ?? []
    for (const oldUrl of currentImages) {
      try {
        const match = oldUrl.match(/\/api\/public\/storage\/(.+)$/) ?? oldUrl.match(/\/storehub\/(.+)$/)
        if (match) await minioClient.removeObject(BUCKET, match[1])
      } catch {}
    }

    await db.update(products)
      .set({ images: [] })
      .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))

    return { ok: true, images: [] }
  })
}
