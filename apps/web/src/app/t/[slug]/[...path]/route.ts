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

  // Extract the path from the redirect URL and fetch from MinIO directly (internal)
  // fileUrl looks like: https://public-host/storehub/tenants/.../file.pdf?v=hash
  // We need to fetch from MinIO internal: http://minio:9000/storehub/tenants/.../file.pdf
  const urlObj = new URL(fileUrl)
  const minioHost = process.env.MINIO_INTERNAL_URL ?? 'http://localhost:9000'
  const internalUrl = `${minioHost}${urlObj.pathname}`

  const pdfRes = await fetch(internalUrl)
  if (!pdfRes.ok) {
    // Fallback: try the public URL directly
    const fallbackRes = await fetch(fileUrl)
    if (!fallbackRes.ok) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    return new NextResponse(fallbackRes.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${docSlug}.pdf"`,
        'Cache-Control': `public, no-cache`,
      },
    })
  }

  return new NextResponse(pdfRes.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${docSlug}.pdf"`,
      'Cache-Control': `public, no-cache`,
    },
  })
}
