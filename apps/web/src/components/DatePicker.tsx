'use client'
import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'

interface DatePickerProps {
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
  className?: string
}

export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = value ? new Date(value + 'T12:00:00') : undefined

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (day: Date | undefined) => {
    if (day) {
      const yyyy = day.getFullYear()
      const mm = String(day.getMonth() + 1).padStart(2, '0')
      const dd = String(day.getDate()).padStart(2, '0')
      onChange(`${yyyy}-${mm}-${dd}`)
    }
    setOpen(false)
  }

  const displayValue = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        readOnly
        value={displayValue}
        onClick={() => setOpen(!open)}
        className={`${className ?? 'input'} cursor-pointer`}
        placeholder="Seleccionar fecha"
      />
      {open && (
        <div className="absolute z-50 mt-1 bg-white rounded-xl shadow-lg border border-[var(--color-border)] p-3">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            locale={es}
            showOutsideDays
            classNames={{
              root: 'text-sm',
              months: 'flex flex-col',
              month_caption: 'flex justify-center items-center h-8 font-semibold text-[var(--color-text-dark)] capitalize',
              nav: 'flex items-center justify-between absolute top-3 left-3 right-3',
              button_previous: 'w-7 h-7 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center hover:bg-gray-100 text-xs',
              button_next: 'w-7 h-7 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center hover:bg-gray-100 text-xs',
              weekdays: 'flex',
              weekday: 'w-8 h-8 flex items-center justify-center text-xs text-[var(--color-text)] font-medium',
              week: 'flex',
              day: 'w-8 h-8 flex items-center justify-center text-xs rounded-lg cursor-pointer hover:bg-[var(--color-surface)] transition-colors',
              day_button: 'w-full h-full flex items-center justify-center',
              selected: 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]',
              today: 'font-bold text-[var(--color-primary)]',
              outside: 'text-gray-300',
            }}
          />
        </div>
      )}
    </div>
  )
}
