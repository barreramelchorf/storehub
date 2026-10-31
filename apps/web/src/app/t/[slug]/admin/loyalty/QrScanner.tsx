'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Camera QR scanner for loyalty check-in. Wraps html5-qrcode.
 *
 * html5-qrcode touches the DOM/camera and must never run on the server, so it's
 * imported dynamically inside useEffect (not a top-level import). The parent
 * renders this component only when the scanner tab is active.
 */
export function QrScanner({ onScan, active }: { onScan: (text: string) => void; active: boolean }) {
  const containerId = 'loyalty-qr-reader'
  const scannerRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let instance: any = null

    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        instance = new Html5Qrcode(containerId)
        scannerRef.current = instance
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            onScanRef.current(decodedText)
          },
          () => { /* per-frame decode errors: ignore */ },
        )
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
              ? 'Permiso de cámara denegado. Habilítalo en el navegador.'
              : 'No se pudo iniciar la cámara.',
          )
        }
      }
    })()

    return () => {
      cancelled = true
      const inst = scannerRef.current
      if (inst) {
        inst.stop().then(() => inst.clear()).catch(() => {})
        scannerRef.current = null
      }
    }
  }, [active])

  return (
    <div>
      <div id={containerId} className="w-full max-w-xs mx-auto rounded-xl overflow-hidden bg-black/5" />
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3 text-center">{error}</p>}
      {!error && <p className="text-xs text-gray-400 text-center mt-3">Apunta la cámara al código QR de la tarjeta.</p>}
    </div>
  )
}
