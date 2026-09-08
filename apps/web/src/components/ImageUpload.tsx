'use client'
import { useState, useRef } from 'react'

export function ImageUpload({ productId, onUploaded, token, hasImage }: { productId: string; onUploaded: (url: string) => void; token: string; hasImage?: boolean }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      // Photos picked from iCloud Photos (not downloaded locally) can be
      // delivered by Safari as a 0-byte File. Reading the whole file with
      // arrayBuffer() forces macOS/Safari to materialize the content
      // (downloading from iCloud if needed). We then upload the materialized
      // bytes instead of the lazy File reference.
      const buffer = await file.arrayBuffer()
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('La imagen está vacía. Si viene de iCloud, ábrela primero en Fotos para descargarla y vuelve a intentar.')
      }
      const materialized = new File([buffer], file.name || 'image.jpg', { type: file.type || 'application/octet-stream' })

      const formData = new FormData()
      formData.append('file', materialized, materialized.name)
      const res = await fetch(`/api/admin/products/${productId}/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-slug': window.location.pathname.match(/^\/t\/([a-z0-9-]+)/)?.[1] ?? '',
        },
        body: formData,
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Upload failed') }
      const data = await res.json()
      onUploaded(data.url)
    } catch (e: any) { alert(e?.message ?? 'Error al subir imagen') }
    finally { setUploading(false); if(fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div className="flex items-center gap-2">
      <input type="file" accept="image/*,.heic,.heif" ref={fileRef} onChange={handleUpload} className="hidden" />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary text-xs">
        {uploading ? 'Subiendo...' : hasImage ? '📷 Cambiar' : '📷 Agregar foto'}
      </button>
    </div>
  )
}
