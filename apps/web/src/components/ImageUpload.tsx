'use client'
import { useState, useRef } from 'react'

export function ImageUpload({ productId, onUploaded, token }: { productId: string; onUploaded: (url: string) => void; token: string }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    try {
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
        {uploading ? 'Subiendo...' : '📷 Agregar foto'}
      </button>
    </div>
  )
}
