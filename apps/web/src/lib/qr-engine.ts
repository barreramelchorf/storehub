/**
 * Camera QR engine for the loyalty scanner (browser only, no React).
 *
 * Why not html5-qrcode: it draws the scan region into a canvas the size of the on-screen
 * viewfinder (~240px) and decodes THAT, so a phone-screen QR that is small in the camera
 * frame (webcam on a desk) is downscaled below what any decoder can read, even from a 1080p
 * stream. Here the decoder always sees the full-resolution video frame.
 *
 *  - asks for 1080p (the browser default is usually 640x480),
 *  - continuous autofocus when the camera exposes it,
 *  - native `BarcodeDetector` (Chrome/Edge/Safari on supported OS) with a jsQR fallback,
 *  - an explicit camera choice (desktops often have several cameras).
 */

export type QrDecoderName = 'native' | 'jsqr'

export interface QrEngineInfo {
  label: string
  width: number
  height: number
  engine: QrDecoderName
  continuousFocus: boolean
  deviceId: string | null
}

export interface QrEngineOptions {
  video: HTMLVideoElement
  onCode: (text: string) => void
  onInfo?: (info: QrEngineInfo) => void
  /** Specific camera (from `listCameras`). Falls back to the default if it is gone. */
  deviceId?: string | null
  /** 'auto' = native BarcodeDetector when available, else jsQR. */
  decoder?: 'auto' | 'jsqr'
  /** Ignore the same text again for this long (ms). */
  dedupeMs?: number
}

export interface QrEngine {
  stop(): void
}

/** The jsQR fallback decodes at most this wide (it is CPU-bound). */
export const MAX_JS_DECODE_WIDTH = 1600
const IDEAL_WIDTH = 1920
const IDEAL_HEIGHT = 1080
const LOOP_MS = 120

export function buildVideoConstraints(deviceId?: string | null): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    width: { ideal: IDEAL_WIDTH },
    height: { ideal: IDEAL_HEIGHT },
    frameRate: { ideal: 30 },
  }
  if (deviceId) video.deviceId = { exact: deviceId }
  else video.facingMode = { ideal: 'environment' } // phones: back camera; desktops: the default one
  return { video, audio: false }
}

/** Scale (w,h) down to at most `maxWidth` wide, keeping the aspect ratio. */
export function scaledSize(w: number, h: number, maxWidth = MAX_JS_DECODE_WIDTH): { w: number; h: number } {
  if (w <= maxWidth) return { w, h }
  const k = maxWidth / w
  return { w: maxWidth, h: Math.max(1, Math.round(h * k)) }
}

/** Spanish message for a getUserMedia failure. */
export function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permiso de cámara denegado. Habilítalo en el navegador.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No se encontró la cámara seleccionada.'
  if (name === 'NotReadableError' || name === 'AbortError') return 'La cámara está en uso por otra aplicación o pestaña.'
  return 'No se pudo iniciar la cámara.'
}

/** Decode an RGBA frame with jsQR (pure; used by the fallback and the tests). */
export async function decodeRgba(data: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
  const { default: jsQR } = await import('jsqr')
  const found = jsQR(data, width, height, { inversionAttempts: 'dontInvert' })
  return found?.data || null
}

interface FrameDecoder {
  name: QrDecoderName
  decode(video: HTMLVideoElement): Promise<string | null>
}

async function createJsQrDecoder(): Promise<FrameDecoder> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d no disponible')
  return {
    name: 'jsqr',
    async decode(video) {
      const { w, h } = scaledSize(video.videoWidth, video.videoHeight)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      ctx.drawImage(video, 0, 0, w, h)
      const img = ctx.getImageData(0, 0, w, h)
      return decodeRgba(img.data, w, h)
    },
  }
}

async function createDecoder(mode: 'auto' | 'jsqr'): Promise<FrameDecoder> {
  const BD = (globalThis as any).BarcodeDetector
  if (mode === 'auto' && BD) {
    try {
      const formats: string[] | undefined = await BD.getSupportedFormats?.()
      if (!formats || formats.includes('qr_code')) {
        const detector = new BD({ formats: ['qr_code'] })
        return {
          name: 'native',
          async decode(video) {
            const codes = await detector.detect(video) // full-resolution frame
            return codes?.[0]?.rawValue || null
          },
        }
      }
    } catch { /* fall through to jsQR */ }
  }
  return createJsQrDecoder()
}

async function openCamera(deviceId?: string | null): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(buildVideoConstraints(deviceId))
  } catch (err) {
    // The saved camera is gone (unplugged): retry with the default one.
    const name = (err as { name?: string })?.name
    if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
      return navigator.mediaDevices.getUserMedia(buildVideoConstraints(null))
    }
    throw err
  }
}

/** Cameras available. Labels are only filled in after the user granted permission. */
export async function listCameras(): Promise<{ id: string; label: string }[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Cámara ${i + 1}` }))
}

export async function startQrEngine(opts: QrEngineOptions): Promise<QrEngine> {
  const { video, onCode, onInfo, deviceId = null, decoder: mode = 'auto', dedupeMs = 2500 } = opts

  const stream = await openCamera(deviceId)
  const track = stream.getVideoTracks()[0]

  // Continuous autofocus where the camera supports it (best effort).
  let continuousFocus = false
  try {
    const caps = (track.getCapabilities?.() ?? {}) as { focusMode?: string[] }
    if (caps.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] })
      continuousFocus = true
    }
  } catch { /* not supported: ignore */ }

  video.srcObject = stream
  video.muted = true
  video.setAttribute('playsinline', 'true')
  try { await video.play() } catch { /* autoplay is allowed after the user gesture; ignore */ }

  let decoder = await createDecoder(mode)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastText = ''
  let lastAt = 0

  const publish = () => {
    const s = track.getSettings?.() ?? {}
    onInfo?.({
      label: track.label,
      width: video.videoWidth || s.width || 0,
      height: video.videoHeight || s.height || 0,
      engine: decoder.name,
      continuousFocus,
      deviceId: s.deviceId ?? null,
    })
  }

  const loop = async () => {
    if (stopped) return
    const started = performance.now()
    try {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const text = await decoder.decode(video)
        if (text && !stopped) {
          const now = Date.now()
          if (text !== lastText || now - lastAt > dedupeMs) {
            lastText = text
            lastAt = now
            onCode(text)
          }
        }
      }
    } catch {
      // The native detector can throw on platforms that expose it without a backend:
      // switch to jsQR for the rest of the session.
      if (decoder.name === 'native') {
        try { decoder = await createJsQrDecoder(); publish() } catch { /* keep trying */ }
      }
    }
    if (stopped) return
    timer = setTimeout(loop, Math.max(30, LOOP_MS - (performance.now() - started)))
  }

  video.addEventListener('loadedmetadata', publish, { once: true })
  publish()
  loop()

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      stream.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    },
  }
}
