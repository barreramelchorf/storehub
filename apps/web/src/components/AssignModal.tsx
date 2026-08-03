'use client'
import { useState } from 'react'

interface AssignItem {
  id: string
  name: string
  extra?: string
}

interface AssignModalProps {
  title: string
  items: AssignItem[]
  assignedIds: string[]
  onToggle: (id: string, assigned: boolean) => void
  onClose: () => void
}

export function AssignModal({ title, items, assignedIds, onToggle, onClose }: AssignModalProps) {
  const [search, setSearch] = useState('')

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
  // Sort: assigned first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aAssigned = assignedIds.includes(a.id) ? 0 : 1
    const bAssigned = assignedIds.includes(b.id) ? 0 : 1
    if (aAssigned !== bAssigned) return aAssigned - bAssigned
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-[var(--color-text-dark)]">{title}</h2>
            <button onClick={onClose} className="text-xl text-[var(--color-text)]">✕</button>
          </div>
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full"
            autoFocus
          />
          <p className="text-xs text-[var(--color-text)] mt-2">{assignedIds.length} asignado(s) · Toca para asignar o quitar</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="grid grid-cols-2 gap-2">
            {sorted.map(item => {
              const isAssigned = assignedIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => onToggle(item.id, isAssigned)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${isAssigned ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'}`}
                >
                  <p className={`text-sm font-medium truncate ${isAssigned ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-dark)]'}`}>{item.name}</p>
                  {item.extra && <p className="text-[10px] text-[var(--color-text)] truncate">{item.extra}</p>}
                  {isAssigned && <span className="text-[10px] text-[var(--color-primary)] font-medium">✓ Asignado</span>}
                </button>
              )
            })}
          </div>
          {sorted.length === 0 && (
            <p className="text-sm text-[var(--color-text)] text-center py-8">No se encontraron resultados</p>
          )}
        </div>
      </div>
    </div>
  )
}
