import { NextRequest, NextResponse } from 'next/server'

// Domain → slug mapping from env (set in Pulumi YAML)
// Format: "xalli.top=xalli,otra.com=otra"
function getDomainMap(): Record<string, string> {
  const raw = process.env.NEXT_PUBLIC_DOMAIN_MAP ?? ''
  if (!raw) return {}
  return Object.fromEntries(raw.split(',').map(entry => {
    const [domain, slug] = entry.split('=')
    return [domain, slug]
  }))
}

const PLATFORM_HOSTS = (process.env.NEXT_PUBLIC_PLATFORM_HOST ?? 'storehub.barreramelchorf.top').split(',')

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] ?? 'localhost'
  const isPlatform = PLATFORM_HOSTS.includes(host) || host === 'localhost' || host.includes('localhost')

  if (isPlatform) return NextResponse.next()

  const pathname = request.nextUrl.pathname

  // Skip internal and already-rewritten paths  
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/platform') || pathname.startsWith('/t/')) {
    return NextResponse.next()
  }

  // Resolve slug from domain map
  const domainMap = getDomainMap()
  const slug = domainMap[host]
  if (!slug) return NextResponse.next() // Unknown domain, let it pass through

  const url = request.nextUrl.clone()

  // /admin/* → /t/{slug}/admin/*
  if (pathname.startsWith('/admin')) {
    url.pathname = `/t/${slug}${pathname}`
    return NextResponse.rewrite(url)
  }

  // /*.pdf → /t/{slug}/*.pdf (for PDF documents)
  if (pathname.endsWith('.pdf')) {
    url.pathname = `/t/${slug}${pathname}`
    return NextResponse.rewrite(url)
  }

  // / (root) is already handled by page.tsx which detects custom domain
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
