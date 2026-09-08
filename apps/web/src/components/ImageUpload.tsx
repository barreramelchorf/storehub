'use client'
import { useState, useRef } from 'react'

export function ImageUpload({ productId, onUploaded, token, hasImage }: { productId: string; onUploaded: (url: string) => void; token: string; hasImage?: boolean }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    let file = fileRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      // Safari/macOS delivers photos as HEIC, which the server's sharp build
      // cannot decode. Convert to JPEG in the browser first.
      const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif'
      if (isHeic) {
        const heic2any = (await import('heic2any')).default
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
        const blob = Array.isArray(converted) ? converted[0] : converted
        file = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
      }

      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/admin/products/${productId}/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-slug': window.location.pathname.match(/^\/t\/([a-z0-9-]+)/)?.[1] ?? '',
        },
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      onUploaded(data.url)
    } catch (e) { alert('Error al subir imagen') }
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
