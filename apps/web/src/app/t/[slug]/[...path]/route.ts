import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: { slug: string; path: string[] } }) {
  const fullPath = params.path.join('/')
  
  // Only handle .pdf requests
  if (!fullPath.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const docSlug = fullPath.replace('.pdf', '')
  const API_URL = process.env.API_URL ?? 'http://localhost:3001'
  
  // Call the API to get the redirect URL
  const res = await fetch(`${API_URL}/api/public/docs/${docSlug}`, {
    headers: { 'x-tenant-slug': params.slug },
    redirect: 'manual',
  })

  if (res.status === 302 || res.status === 301) {
    return NextResponse.redirect(res.headers.get('location')!)
  }

  return NextResponse.json({ error: 'Document not found' }, { status: 404 })
}
