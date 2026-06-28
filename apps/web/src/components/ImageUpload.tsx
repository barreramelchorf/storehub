'use client'
import { useState, useRef } from 'react'
import { useAuthStore } from '@/lib/store'

export function ImageUpload({ productId, onUploaded }: { productId: string; onUploaded: (url: string) => void }) {
  const token = useAuthStore(s => s.token)!
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/products/${productId}/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-slug': window.location.hostname.split('.')[0] === 'localhost' ? 'demo-cafe' : window.location.hostname.split('.')[0],
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
