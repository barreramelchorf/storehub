'use client'
import { useState, useRef } from 'react'
import { api } from '@/lib/api'
import { getAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'

interface PreviewData {
  mode: 'preview'
  totalRows: number
  validRows: number
  errors: Array<{ line: number; field: string; message: string }>
  newCategories: string[]
  existingCategories: string[]
  products: Array<{ name: string; category: string; price: number; stock: number; minStock: number; description: string | null; active: boolean; visible: boolean }>
}

export default function BulkImportPage() {
  const params = useParams()
  const token = getAuthStore(params.slug as string)(s => s.token)!
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; categoriesCreated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)
    setResult(null)
    setPreview(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      let text = ev.target?.result as string
      // Strip BOM
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
      setCsvText(text)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handlePreview = async () => {
    if (!csvText) return
    setLoading(true)
    setError(null)
    try {
      const data = await api('/api/admin/bulk/products?mode=preview', {
        token,
        method: 'POST',
        body: JSON.stringify({ csv: csvText }),
        headers: { 'Content-Type': 'application/json' },
      })
      setPreview(data)
    } catch (e: any) {
      setError(e.message ?? 'Error al procesar el archivo')
    }
    setLoading(false)
  }

  const handleConfirm = async () => {
    if (!csvText) return
    setLoading(true)
    setError(null)
    try {
      const data = await api('/api/admin/bulk/products?mode=confirm', {
        token,
        method: 'POST',
        body: JSON.stringify({ csv: csvText }),
        headers: { 'Content-Type': 'application/json' },
      })
      setResult(data)
      setPreview(null)
      setCsvText(null)
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: any) {
      setError(e.message ?? 'Error al importar')
    }
    setLoading(false)
  }

  const handleDownloadTemplate = async () => {
    try {
      const pathMatch = window.location.pathname.match(/^\/t\/([a-z0-9-]+)/)
      const tenantHeader: Record<string, string> = {}
      if (pathMatch) tenantHeader['x-tenant-slug'] = pathMatch[1]

      const res = await fetch(`/api/admin/bulk/template`, {
        headers: { Authorization: `Bearer ${token}`, ...tenantHeader },
      })
      if (!res.ok) throw new Error('Error al descargar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'productos_template.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('No se pudo descargar el template')
    }
  }

  const reset = () => {
    setCsvText(null)
    setFileName(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">Carga masiva de productos</h1>
        <button onClick={handleDownloadTemplate}
          className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg text-[var(--color-text)] hover:bg-gray-50 transition-colors">
          📥 Descargar template
        </button>
      </div>

      {/* Instructions */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-2">Instrucciones</h2>
        <ol className="text-sm text-[var(--color-text)] space-y-1 list-decimal list-inside">
          <li>Descarga el template CSV con el botón de arriba</li>
          <li>Llena el archivo con tus productos (puedes usar Excel o Google Sheets)</li>
          <li>Guarda como CSV (UTF-8)</li>
          <li>Sube el archivo aquí abajo y revisa el preview</li>
          <li>Confirma para importar</li>
        </ol>
        <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
          <strong>Columnas:</strong> name (requerido), category (requerido), price (requerido), stock, min_stock, description, active, visible<br/>
          <strong>Categorías:</strong> si una categoría no existe, se crea automáticamente.
        </div>
      </div>

      {/* Success result */}
      {result && (
        <div className="card p-5 mb-6 border-l-4 border-l-green-500">
          <h2 className="text-sm font-semibold text-green-700 mb-2">✅ Importación exitosa</h2>
          <p className="text-sm text-[var(--color-text)]">
            Se crearon <strong>{result.created}</strong> productos
            {result.categoriesCreated > 0 && <> y <strong>{result.categoriesCreated}</strong> categorías nuevas</>}.
          </p>
          <button onClick={reset} className="mt-3 text-sm text-[var(--color-primary)] font-medium hover:underline">
            Importar otro archivo
          </button>
        </div>
      )}

      {/* Upload area */}
      {!result && (
        <div className="card p-5 mb-6">
          <div className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center">
            <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={handleFile} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <div className="text-4xl mb-3">📁</div>
              <p className="text-sm font-medium text-[var(--color-text-dark)]">
                {fileName ? fileName : 'Selecciona un archivo CSV'}
              </p>
              <p className="text-xs text-[var(--color-text)] mt-1">
                {fileName ? 'Clic para cambiar archivo' : 'O arrastra y suelta aquí'}
              </p>
            </label>
          </div>

          {csvText && !preview && (
            <div className="mt-4 flex justify-end">
              <button onClick={handlePreview} disabled={loading}
                className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {loading ? 'Procesando...' : 'Ver preview'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 mb-6 border-l-4 border-l-red-500">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">Resumen</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[var(--color-text)]">Filas válidas</p>
                <p className="font-bold text-lg text-green-600">{preview.validRows}</p>
              </div>
              <div>
                <p className="text-[var(--color-text)]">Errores</p>
                <p className={`font-bold text-lg ${preview.errors.length > 0 ? 'text-red-500' : 'text-green-600'}`}>{preview.errors.length}</p>
              </div>
              <div>
                <p className="text-[var(--color-text)]">Categorías nuevas</p>
                <p className="font-bold text-lg text-blue-600">{preview.newCategories.length}</p>
              </div>
              <div>
                <p className="text-[var(--color-text)]">Categorías existentes</p>
                <p className="font-bold text-lg">{preview.existingCategories.length}</p>
              </div>
            </div>
            {preview.newCategories.length > 0 && (
              <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
                <strong>Se crearán:</strong> {preview.newCategories.join(', ')}
              </div>
            )}
          </div>

          {/* Errors */}
          {preview.errors.length > 0 && (
            <div className="card p-5 border-l-4 border-l-amber-400">
              <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-2">⚠️ Filas con errores (no se importarán)</h2>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {preview.errors.map((e, i) => (
                  <p key={i} className="text-xs text-[var(--color-text)]">
                    Línea {e.line}: <strong>{e.field}</strong> — {e.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Products table */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">
              Productos a importar ({preview.products.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left py-2 px-2 font-medium text-[var(--color-text)]">Nombre</th>
                    <th className="text-left py-2 px-2 font-medium text-[var(--color-text)]">Categoría</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-text)]">Precio</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-text)]">Stock</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-text)]">Mín</th>
                    <th className="text-center py-2 px-2 font-medium text-[var(--color-text)]">Visible</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.products.slice(0, 50).map((p, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-2 px-2 text-[var(--color-text-dark)]">{p.name}</td>
                      <td className="py-2 px-2 text-[var(--color-text)]">{p.category}</td>
                      <td className="py-2 px-2 text-right">${p.price.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">{p.stock}</td>
                      <td className="py-2 px-2 text-right">{p.minStock}</td>
                      <td className="py-2 px-2 text-center">{p.visible ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.products.length > 50 && (
                <p className="text-xs text-[var(--color-text)] mt-2 text-center">
                  Mostrando 50 de {preview.products.length} productos
                </p>
              )}
            </div>
          </div>

          {/* Confirm / Cancel */}
          <div className="flex gap-3 justify-end">
            <button onClick={reset}
              className="px-6 py-2 border border-[var(--color-border)] rounded-lg text-sm font-medium text-[var(--color-text)] hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleConfirm} disabled={loading || preview.validRows === 0}
              className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {loading ? 'Importando...' : `Importar ${preview.validRows} productos`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
