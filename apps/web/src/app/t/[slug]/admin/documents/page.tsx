'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function DocumentsPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: docs } = useQuery({ queryKey: ['documents'], queryFn: () => api('/api/admin/documents', { token }) })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0]
      if (!file) throw new Error('Selecciona un archivo')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slug', slug)
      formData.append('name', name || file.name)
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': window.location.hostname.split('.')[0] === 'localhost' ? 'demo-cafe' : window.location.hostname.split('.')[0] },
        body: formData,
      })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error) }
      return res.json()
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['documents'] }); setSlug(''); setName(''); if(fileRef.current) fileRef.current.value = '' },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/documents/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Documentos PDF</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h2 className="font-medium mb-3">Subir PDF</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Archivo PDF</label>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary w-full text-left truncate">
              {fileRef.current?.files?.[0]?.name ?? 'Seleccionar archivo...'}
            </button>
            <input type="file" accept=".pdf" ref={fileRef} className="hidden" onChange={() => setName(fileRef.current?.files?.[0]?.name ?? '')} />
          </div>
          <div><label className="label">Nombre</label><input placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} className="input" /></div>
          <div><label className="label">Slug</label><input placeholder="ej: menu" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="input" required /></div>
        </div>
        <button onClick={() => uploadMutation.mutate()} disabled={!slug || uploadMutation.isPending} className="btn-primary mt-3">
          {uploadMutation.isPending ? 'Subiendo...' : 'Subir documento'}
        </button>
        {uploadMutation.isError && <p className="text-red-500 text-xs mt-2">{(uploadMutation.error as Error).message}</p>}
        {uploadMutation.isSuccess && <p className="text-green-500 text-xs mt-2">✓ Subido</p>}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        {(!docs || docs.length === 0) && <p className="text-gray-500 text-sm">No hay documentos.</p>}
        <div className="space-y-2">
          {docs?.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium text-sm">{d.name}</p>
                <p className="text-xs text-gray-400">/{d.slug}.pdf {d.active ? '✅ Activo' : '🚫 Inactivo'}</p>
              </div>
              <button onClick={() => { if(confirm('¿Eliminar?')) deleteMutation.mutate(d.id) }} className="text-red-500 text-xs hover:underline">Eliminar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
