'use client'
import { useEffect, useRef, useState } from 'react'
import {
  startQrEngine, listCameras, cameraErrorMessage,
  type QrEngine, type QrEngineInfo,
} from '@/lib/qr-engine'

const CAMERA_KEY = 'storehub.scanner.camera'

/**
 * Camera QR scanner for loyalty check-in (phone or desktop webcam).
 *
 * The decoding lives in `lib/qr-engine` (full-resolution frames, native BarcodeDetector
 * with a jsQR fallback). This component is only the video, the camera picker and status.
 * The parent renders it only while the scanner tab is active.
 */
export function QrScanner({ onScan, active }: { onScan: (text: string) => void; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<QrEngineInfo | null>(null)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(() => {
    try { return typeof window === 'undefined' ? null : window.localStorage.getItem(CAMERA_KEY) } catch { return null }
  })
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!active) return
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let engine: QrEngine | null = null
    setError(null)

    ;(async () => {
      try {
        const e = await startQrEngine({
          video,
          deviceId,
          onCode: (text) => onScanRef.current(text),
          onInfo: (i) => { if (!cancelled) setInfo(i) },
        })
        if (cancelled) { e.stop(); return }
        engine = e
        // Labels are only available once the camera permission is granted.
        const list = await listCameras()
        if (!cancelled) setCameras(list)
      } catch (err) {
        if (!cancelled) setError(cameraErrorMessage(err))
      }
    })()

    return () => {
      cancelled = true
      engine?.stop()
    }
  }, [active, deviceId])

  function chooseCamera(id: string) {
    try { window.localStorage.setItem(CAMERA_KEY, id) } catch { /* private mode: ignore */ }
    setInfo(null)
    setDeviceId(id)
  }

  return (
    <div>
      <div className="w-full max-w-md mx-auto rounded-xl overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="w-full max-h-[60vh] object-contain" />
      </div>

      {cameras.length > 1 && (
        <select
          value={info?.deviceId ?? deviceId ?? ''}
          onChange={(e) => chooseCamera(e.target.value)}
          aria-label="Cámara"
          className="block w-full max-w-md mx-auto mt-3 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          {cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3 text-center">{error}</p>}
      {!error && (
        <>
          <p className="text-xs text-gray-400 text-center mt-3">
            Apunta la cámara al código QR de la tarjeta. Con webcam, acerca el celular (unos 20 a 30 cm),
            con el brillo al máximo y sin reflejos.
          </p>
          {info && info.width > 0 && (
            <p className="text-[11px] text-gray-300 text-center mt-1">
              {info.label || 'Cámara'} · {info.width}×{info.height}
            </p>
          )}
        </>
      )}
    </div>
  )
}
