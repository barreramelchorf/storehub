/**
 * APNs push for Apple Wallet pass updates.
 *
 * A pass-update push is an HTTP/2 request to APNs with an EMPTY JSON payload,
 * signed with the SAME Pass Type ID certificate/key used to sign the pass
 * (confirmed in Apple's "Adding a Web Service to Update Passes" docs). The push
 * only *notifies*; the device then pulls the updated pass from our web service.
 *
 * Uses Node's native http2 + the mutual-TLS cert — no external APNs SDK needed.
 * Pushes only work in APNs production, which matches our deployment.
 */
import http2 from 'node:http2'
import { getAppleConfig } from './config.js'

const APNS_HOST = 'https://api.push.apple.com'
const APNS_TOPIC_SUFFIX = '' // for pass pushes, apns-topic = passTypeIdentifier

export interface ApnsResult {
  pushToken: string
  ok: boolean
  status?: number
  reason?: string
  /** true when APNs says the token is dead and should be removed. */
  invalidToken?: boolean
}

/**
 * Send empty-payload pushes to a set of device push tokens for a pass.
 * Returns per-token results so the caller can prune invalid registrations.
 * No-op (returns []) if Apple is not configured.
 */
export async function sendApplePushes(pushTokens: string[]): Promise<ApnsResult[]> {
  const cfg = getAppleConfig()
  if (!cfg || pushTokens.length === 0) return []

  const client = http2.connect(APNS_HOST, {
    cert: cfg.signerCert,
    key: cfg.signerKey,
    passphrase: cfg.signerKeyPassphrase,
  })

  const results: ApnsResult[] = []

  try {
    await Promise.all(
      pushTokens.map(
        (pushToken) =>
          new Promise<void>((resolve) => {
            const req = client.request({
              ':method': 'POST',
              ':path': `/3/device/${pushToken}`,
              'apns-topic': `${cfg.passTypeId}${APNS_TOPIC_SUFFIX}`,
              'apns-push-type': 'background',
              'content-type': 'application/json',
            })

            let status = 0
            let body = ''
            req.on('response', (headers) => {
              status = Number(headers[':status'] ?? 0)
            })
            req.setEncoding('utf8')
            req.on('data', (chunk) => { body += chunk })
            req.on('end', () => {
              let reason: string | undefined
              try { reason = body ? (JSON.parse(body).reason as string) : undefined } catch { /* ignore */ }
              results.push({
                pushToken,
                ok: status === 200,
                status,
                reason,
                // 410 Gone or BadDeviceToken => token is dead.
                invalidToken: status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered',
              })
              resolve()
            })
            req.on('error', () => {
              results.push({ pushToken, ok: false, reason: 'request_error' })
              resolve()
            })
            // Empty JSON payload for pass updates.
            req.end('{}')
          }),
      ),
    )
  } finally {
    client.close()
  }

  return results
}
