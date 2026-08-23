import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: { slug: string; path: string[] } }) {
  const fullPath = params.path.join('/')
  
  if (!fullPath.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const docSlug = fullPath.replace('.pdf', '')
  const API_URL = process.env.API_URL ?? 'http://localhost:3001'
  
  // Proxy PDF from API (API handles MinIO access)
  const res = await fetch(`${API_URL}/api/public/docs/${docSlug}/file`, {
    headers: { 'x-tenant-slug': params.slug },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${docSlug}.pdf"`,
      'Cache-Control': 'public, no-cache',
      ...(res.headers.get('etag') && { 'ETag': res.headers.get('etag')! }),
    },
  })
}
