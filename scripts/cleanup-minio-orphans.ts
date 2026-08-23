#!/usr/bin/env tsx
/**
 * MinIO Orphan Cleanup Script
 * 
 * Safely removes files from MinIO that are not referenced in the database.
 * 
 * Usage:
 *   DRY_RUN=true tsx scripts/cleanup-minio-orphans.ts   # Preview only (default)
 *   DRY_RUN=false tsx scripts/cleanup-minio-orphans.ts  # Actually delete
 * 
 * Required env vars:
 *   DATABASE_URL - PostgreSQL connection string
 *   MINIO_ENDPOINT - MinIO host (e.g. minio.storehub-data-prod.svc.cluster.local)
 *   MINIO_PORT - MinIO port (default: 9000)
 *   MINIO_ACCESS_KEY - MinIO access key
 *   MINIO_SECRET_KEY - MinIO secret key
 *   MINIO_BUCKET - Bucket name (default: storehub)
 */

import { Client } from 'minio'
import postgres from 'postgres'

const DRY_RUN = process.env.DRY_RUN !== 'false'

// Connect to DB
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1) }
const sql = postgres(DATABASE_URL, { max: 5 })

// Connect to MinIO
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'storehub',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'storehub123',
})
const BUCKET = process.env.MINIO_BUCKET ?? 'storehub'

async function listMinIOObjects(prefix: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const objects: string[] = []
    const stream = minioClient.listObjectsV2(BUCKET, prefix, true)
    stream.on('data', (obj) => { if (obj.name) objects.push(obj.name) })
    stream.on('end', () => resolve(objects))
    stream.on('error', reject)
  })
}

async function cleanupDocuments() {
  console.log('\n📄 === DOCUMENTS ===')
  
  // Get all doc files in MinIO
  const minioFiles = await listMinIOObjects('tenants/')
  const docFiles = minioFiles.filter(f => f.includes('/docs/') && f.endsWith('.pdf'))
  console.log(`  MinIO: ${docFiles.length} PDF files found`)

  // Get all documents from DB (slug + tenantId to construct expected path)
  const dbDocs = await sql`SELECT tenant_id, slug FROM documents`
  const expectedPaths = new Set(dbDocs.map((d: any) => `tenants/${d.tenant_id}/docs/${d.slug}.pdf`))
  console.log(`  DB: ${dbDocs.length} document records`)

  // Find orphans
  const orphans = docFiles.filter(f => !expectedPaths.has(f))
  console.log(`  Orphans: ${orphans.length}`)

  if (orphans.length === 0) {
    console.log('  ✅ No orphan documents')
    return { orphans: 0, deleted: 0 }
  }

  for (const orphan of orphans) {
    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would delete: ${orphan}`)
    } else {
      await minioClient.removeObject(BUCKET, orphan)
      console.log(`  🗑️ Deleted: ${orphan}`)
    }
  }

  return { orphans: orphans.length, deleted: DRY_RUN ? 0 : orphans.length }
}

async function cleanupProductImages() {
  console.log('\n🖼️  === PRODUCT IMAGES ===')

  // Get all image files in MinIO
  const minioFiles = await listMinIOObjects('tenants/')
  const imageFiles = minioFiles.filter(f => f.includes('/products/') && f.endsWith('.webp'))
  console.log(`  MinIO: ${imageFiles.length} image files found`)

  // Get all product images from DB
  const dbProducts = await sql`SELECT images FROM products WHERE images IS NOT NULL AND images != '[]'::jsonb`
  const expectedPaths = new Set<string>()
  for (const p of dbProducts) {
    const images = (p.images as string[]) ?? []
    for (const url of images) {
      const match = url.match(/\/storehub\/(.+)$/)
      if (match) expectedPaths.add(match[1])
    }
  }
  console.log(`  DB: ${expectedPaths.size} image URLs referenced`)

  // Find orphans
  const orphans = imageFiles.filter(f => !expectedPaths.has(f))
  console.log(`  Orphans: ${orphans.length}`)

  if (orphans.length === 0) {
    console.log('  ✅ No orphan images')
    return { orphans: 0, deleted: 0 }
  }

  for (const orphan of orphans) {
    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would delete: ${orphan}`)
    } else {
      await minioClient.removeObject(BUCKET, orphan)
      console.log(`  🗑️ Deleted: ${orphan}`)
    }
  }

  return { orphans: orphans.length, deleted: DRY_RUN ? 0 : orphans.length }
}

async function main() {
  console.log(`🧹 MinIO Orphan Cleanup — ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚠️  LIVE MODE (will delete!)'}`)
  console.log(`  Bucket: ${BUCKET}`)
  console.log(`  MinIO: ${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? 9000}`)

  const docResult = await cleanupDocuments()
  const imgResult = await cleanupProductImages()

  console.log('\n📊 Summary:')
  console.log(`  Documents: ${docResult.orphans} orphans found, ${docResult.deleted} deleted`)
  console.log(`  Images: ${imgResult.orphans} orphans found, ${imgResult.deleted} deleted`)

  if (DRY_RUN && (docResult.orphans > 0 || imgResult.orphans > 0)) {
    console.log('\n⚠️  Run with DRY_RUN=false to actually delete orphans')
  }

  await sql.end()
  process.exit(0)
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1) })
