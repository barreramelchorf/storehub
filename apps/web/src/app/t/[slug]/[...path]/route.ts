import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: { slug: string; path: string[] } }) {
  const fullPath = params.path.join('/')
  
  if (!fullPath.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const docSlug = fullPath.replace('.pdf', '')
  const API_URL = process.env.API_URL ?? 'http://localhost:3001'
  
  // Get the document info from API
  const res = await fetch(`${API_URL}/api/public/docs/${docSlug}`, {
    headers: { 'x-tenant-slug': params.slug },
    redirect: 'manual',
  })

  if (res.status !== 302 && res.status !== 301) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const fileUrl = res.headers.get('location')
  if (!fileUrl) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Proxy the file — fetch from MinIO internally and serve to client
  const internalUrl = fileUrl.replace(/https?:\/\/[^/]+/, API_URL.replace(':3001', ':9000'))
  // Use the MinIO internal service URL
  const minioUrl = `http://minio.storehub-data-prod.svc.cluster.local:9000/storehub/tenants/${params.slug === 'xalli' ? '7faa7c95-add1-4c2c-9fd0-5ed442856600' : params.slug}/docs/${docSlug}.pdf`
  
  // Actually, just fetch from the public URL since we know it works
  const pdfRes = await fetch(fileUrl)
  if (!pdfRes.ok) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  return new NextResponse(pdfRes.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${docSlug}.pdf"`,
      'Cache-Control': 'public, max-age=60',
    },
  })
}
