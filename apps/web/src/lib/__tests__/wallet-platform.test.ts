import { describe, it, expect } from 'vitest'
import { detectWalletPlatform } from '../wallet-platform'

describe('detectWalletPlatform', () => {
  it('iPhone -> apple', () => {
    expect(detectWalletPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBe('apple')
  })
  it('Android -> google', () => {
    expect(detectWalletPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36')).toBe('google')
  })
  it('iPadOS (UA de Mac con touch) -> apple', () => {
    expect(detectWalletPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe('apple')
  })
  it('Mac de escritorio / Windows -> other', () => {
    expect(detectWalletPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe('other')
    expect(detectWalletPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('other')
  })
})
