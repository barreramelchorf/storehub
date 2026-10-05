import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '../api'

// These tests run in node (no window), exercising the server-side path of api().
// They verify the fix for: "Body cannot be empty when content-type is set to
// 'application/json'" — the JSON content-type must only be sent when a body exists.

function mockFetchOnce(responseBody: any = { ok: true }, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
  })
  // @ts-expect-error assign to global
  globalThis.fetch = fetchMock
  return fetchMock
}

function headersFromCall(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const [, opts] = fetchMock.mock.calls[0]
  return (opts?.headers ?? {}) as Record<string, string>
}

describe('api() Content-Type handling', () => {
  const origFetch = globalThis.fetch
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { globalThis.fetch = origFetch })

  it('does NOT send Content-Type when there is no body (bodyless POST)', async () => {
    const fetchMock = mockFetchOnce()
    await api('/api/admin/cash-session/x/reopen', { method: 'POST', token: 't', host: 'demo.example.com' })
    const headers = headersFromCall(fetchMock)
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('sends Content-Type: application/json when a body is present', async () => {
    const fetchMock = mockFetchOnce()
    await api('/api/admin/sales', { method: 'POST', body: JSON.stringify({ a: 1 }), token: 't', host: 'demo.example.com' })
    const headers = headersFromCall(fetchMock)
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('does NOT send Content-Type on a plain GET', async () => {
    const fetchMock = mockFetchOnce()
    await api('/api/admin/cash-session/current', { token: 't', host: 'demo.example.com' })
    const headers = headersFromCall(fetchMock)
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('does NOT send Content-Type on a bodyless DELETE', async () => {
    const fetchMock = mockFetchOnce()
    await api('/api/admin/products/123', { method: 'DELETE', token: 't', host: 'demo.example.com' })
    const headers = headersFromCall(fetchMock)
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('still sends Authorization when a token is given', async () => {
    const fetchMock = mockFetchOnce()
    await api('/api/admin/cash-session/current', { token: 'abc', host: 'demo.example.com' })
    const headers = headersFromCall(fetchMock)
    expect(headers['Authorization']).toBe('Bearer abc')
  })
})
