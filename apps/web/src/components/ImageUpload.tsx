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
      const formData = new FormData()
      // Safari (macOS/iOS WebKit) requires the filename as the 3rd argument;
      // without it, the file part is serialized without a filename and the
      // server's multipart parser does not recognize it as a file (request.file()
      // returns null). Chrome/Firefox work either way. This is a known WebKit quirk.
      formData.append('file', file, file.name)
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
