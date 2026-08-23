import type { FastifyInstance } from 'fastify'

export async function storageRoutes(app: FastifyInstance) {
  // Serve any file from MinIO storage (images, documents, etc)
  // No tenant resolution needed — path contains the tenant ID already
  app.get('/api/public/storage/*', async (request, reply) => {
    const filePath = (request.params as any)['*']
    if (!filePath) return reply.code(400).send({ error: 'Path required' })

    const { minioClient, BUCKET } = await import('../plugins/storage.js')

    try {
      const stat = await minioClient.statObject(BUCKET, filePath)
      const stream = await minioClient.getObject(BUCKET, filePath)
      const contentType = stat.metaData?.['content-type']
        ?? (filePath.endsWith('.webp') ? 'image/webp'
          : filePath.endsWith('.jpeg') || filePath.endsWith('.jpg') ? 'image/jpeg'
          : filePath.endsWith('.png') ? 'image/png'
          : filePath.endsWith('.pdf') ? 'application/pdf'
          : 'application/octet-stream')
      reply.header('Content-Type', contentType)
      reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      return reply.send(stream)
    } catch (e: any) {
      return reply.code(404).send({ error: 'File not found' })
    }
  })
}
