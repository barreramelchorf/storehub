import { NextResponse } from 'next/server'

// Lightweight health check for Kubernetes liveness/readiness probes.
// Returns 200 directly (no redirect, no auth, no tenant resolution) so the
// rollout can reliably detect a healthy web pod.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true })
}
