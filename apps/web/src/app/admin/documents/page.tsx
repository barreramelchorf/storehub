'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function DocumentsPage() {
  const token = useAuthStore(s => s.token)!
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState('')

  const { data: docs } = useQuery({ queryKey: ['documents'], queryFn: () => api('/api/admin/documents', { token }) })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/documents/${id}`, { method: 'DELETE', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Documentos PDF</h1>
      <div className="bg-white rounded-lg shadow p-4">
        {docs?.length === 0 && <p className="text-gray-500 text-sm">No hay documentos. Sube tu primer PDF.</p>}
        <div className="space-y-2">
          {docs?.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium text-sm">{d.name}</p>
                <p className="text-xs text-gray-400">/{d.slug}.pdf {d.active ? '✅' : '🚫'}</p>
              </div>
              <button onClick={() => deleteMutation.mutate(d.id)} className="text-red-500 text-xs">Eliminar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
