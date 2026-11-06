'use client'
import { useState } from 'react'
import { currentWalletPlatform } from '@/lib/wallet-platform'

interface Props {
  appleUrl: string | null
  googleUrl: string | null
}

/**
 * Shows only the wallet button that matches the visitor's device (iPhone ->
 * Apple, Android -> Google). On desktop/unknown devices both are shown.
 * Only rendered after user interaction / client fetch, never during SSR.
 */
export function WalletButtons({ appleUrl, googleUrl }: Props) {
  const [platform] = useState(currentWalletPlatform)
  const showApple = !!appleUrl && platform !== 'google'
  const showGoogle = !!googleUrl && platform !== 'apple'

  return (
    <div className="space-y-3">
      {showApple && (
        <a
          href={appleUrl!}
          className="flex items-center justify-center gap-2 w-full bg-black text-white rounded-xl py-3 font-medium hover:opacity-90 transition-opacity"
        >
           Agregar a Apple Wallet
        </a>
      )}
      {showGoogle && (
        <a
          href={googleUrl!}
          className="flex items-center justify-center gap-2 w-full bg-[#4285F4] text-white rounded-xl py-3 font-medium hover:opacity-90 transition-opacity"
        >
          Agregar a Google Wallet
        </a>
      )}
      {!showApple && !showGoogle && (
        <p className="text-sm text-gray-500">
          Tu tarjeta fue creada, pero la opción de Wallet para tu dispositivo aún no está
          disponible — contacta al negocio.
        </p>
      )}
    </div>
  )
}
