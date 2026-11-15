import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import {
  buildVideoConstraints, scaledSize, cameraErrorMessage, decodeRgba, MAX_JS_DECODE_WIDTH,
} from '../qr-engine'

const CARD_ID = '3f2b8c1e-9a47-4d6b-8e15-72c0a9d4b6f1' // the pass QR encodes the card UUID

/** Black-on-white QR as an RGBA frame, `px` pixels per module, 4-module quiet zone. */
function renderQr(text: string, px: number, padding = 0) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = modules.size
  const side = (n + 8) * px
  const w = side + 2 * padding
  const data = new Uint8ClampedArray(w * w * 4).fill(255)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / px) - 4
      const my = Math.floor(y / px) - 4
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && modules.data[my * n + mx]
      if (!dark) continue
      const i = ((y + padding) * w + x + padding) * 4
      data[i] = data[i + 1] = data[i + 2] = 0
    }
  }
  return { data, w }
}

describe('decodeRgba (jsQR fallback)', () => {
  it('lee el UUID de la tarjeta con módulos de 5 px (QR pequeño en cuadro 1080p)', async () => {
    const { data, w } = renderQr(CARD_ID, 5)
    expect(await decodeRgba(data, w, w)).toBe(CARD_ID)
  })

  it('lee con 3 px por módulo', async () => {
    const { data, w } = renderQr(CARD_ID, 3)
    expect(await decodeRgba(data, w, w)).toBe(CARD_ID)
  })

  it('no inventa nada en un cuadro sin QR', async () => {
    const data = new Uint8ClampedArray(200 * 200 * 4).fill(128)
    expect(await decodeRgba(data, 200, 200)).toBeNull()
  })

  it('lee un QR chico dentro de un cuadro grande (como en una webcam)', async () => {
    // QR de 4 px/módulo con 800 px de margen blanco alrededor: cuadro de ~1.5 MP
    const { data, w } = renderQr(CARD_ID, 4, 800)
    expect(w).toBeGreaterThan(1400)
    expect(await decodeRgba(data, w, w)).toBe(CARD_ID)
  })
})

describe('scaledSize', () => {
  it('no toca los cuadros que ya caben', () => {
    expect(scaledSize(1280, 720)).toEqual({ w: 1280, h: 720 })
    expect(scaledSize(MAX_JS_DECODE_WIDTH, 900)).toEqual({ w: MAX_JS_DECODE_WIDTH, h: 900 })
  })
  it('reduce manteniendo la proporción (2560x1440 -> 1600x900)', () => {
    expect(scaledSize(2560, 1440)).toEqual({ w: 1600, h: 900 })
  })
})

describe('buildVideoConstraints', () => {
  it('pide 1080p ideal y la cámara trasera en celulares', () => {
    const v = buildVideoConstraints().video as MediaTrackConstraints
    expect(v.width).toEqual({ ideal: 1920 })
    expect(v.height).toEqual({ ideal: 1080 })
    expect(v.facingMode).toEqual({ ideal: 'environment' })
    expect(v.deviceId).toBeUndefined()
  })
  it('con una cámara elegida usa su id y no el facingMode', () => {
    const v = buildVideoConstraints('cam-123').video as MediaTrackConstraints
    expect(v.deviceId).toEqual({ exact: 'cam-123' })
    expect(v.facingMode).toBeUndefined()
  })
})

describe('cameraErrorMessage', () => {
  it('traduce los errores de getUserMedia', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toMatch(/Permiso de cámara denegado/)
    expect(cameraErrorMessage({ name: 'NotFoundError' })).toMatch(/No se encontró la cámara/)
    expect(cameraErrorMessage({ name: 'NotReadableError' })).toMatch(/en uso/)
    expect(cameraErrorMessage(new Error('x'))).toBe('No se pudo iniciar la cámara.')
    expect(cameraErrorMessage(null)).toBe('No se pudo iniciar la cámara.')
  })
})
