import { LoyaltyRecoverClient } from './LoyaltyRecoverClient'

export const dynamic = 'force-dynamic'

export default function LoyaltyRecoverPage({ params }: { params: { slug: string; token: string } }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <LoyaltyRecoverClient slug={params.slug} token={params.token} />
      </div>
    </main>
  )
}
