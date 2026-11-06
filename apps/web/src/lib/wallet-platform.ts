export type WalletPlatform = 'apple' | 'google' | 'other'

/**
 * Detect which wallet the visitor can use from the user agent.
 * iOS/iPadOS -> Apple Wallet, Android -> Google Wallet, anything else (desktop)
 * -> 'other' (callers show both options).
 */
export function detectWalletPlatform(
  userAgent: string,
  maxTouchPoints = 0,
): WalletPlatform {
  if (/android/i.test(userAgent)) return 'google'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'apple'
  // iPadOS 13+ reports itself as a Mac but has a touch screen.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'apple'
  return 'other'
}

export function currentWalletPlatform(): WalletPlatform {
  if (typeof navigator === 'undefined') return 'other'
  return detectWalletPlatform(navigator.userAgent, navigator.maxTouchPoints)
}
