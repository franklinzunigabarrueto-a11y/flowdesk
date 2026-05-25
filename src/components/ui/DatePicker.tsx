'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS_SHORT = ['Do','Lu','Ma','Mi','Ju','Vi','Sá']

interface Props {
  value: string // YYYY-MM-DD
  onChange: (date: string) => void
  placeholder?: string
  style?: React.CSSProperties
}

export default function DatePicker({ value, onChange, placeholder = 'Seleccionar fecha', style }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => value ? new Date(value + 'T12:00:00') : new Date())
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (value) setView(new Date(value + 'T12:00:00'))
  }, [value])

  function openCalendar() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopupPos({ top: rect.bottom + 6, left: rect.left, width: rect.width })
    }
    setOpen(o => !o)
  }

  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = new Date().toISOString().split('T')[0]

  function display() {
    if (!value) return placeholder
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }

  function pick(day: number) {
    onChange(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    setOpen(false)
  }

  const popup = open && (
    <div ref={popupRef} style={{
      position: 'fixed',
      top: popupPos.top,
      left: popupPos.left,
      zIndex: 9999,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '12px 12px 10px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      width: '230px', animation: 'fadeIn 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <button type="button" onClick={() => setView(new Date(year, month - 1, 1))} style={navBtn}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => setView(new Date(year, month + 1, 1))} style={navBtn}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const sel = dateStr === value
          const isToday = dateStr === todayStr
          return (
            <button key={day} type="button" onClick={() => pick(day)} style={{
              padding: '5px 2px', borderRadius: '7px', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: sel || isToday ? 600 : 400, textAlign: 'center',
              background: sel ? 'var(--primary)' : isToday ? 'rgba(249,115,22,0.12)' : 'transparent',
              color: sel ? 'white' : isToday ? 'var(--primary)' : 'var(--foreground)',
              transition: 'background 0.1s',
            }}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative', ...style }}>
      <button
        ref={btnRef}
        type="button"
        onClick={openCalendar}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: '9px',
          border: `1.5px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          background: 'var(--background)',
          color: value ? 'var(--foreground)' : 'var(--text-muted)',
          fontSize: '0.875rem', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          outline: 'none', transition: 'border-color 0.15s',
        }}
      >
        <span>{display()}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
      </button>

      {typeof document !== 'undefined' && popup && createPortal(popup, document.body)}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'var(--surface-hover)', border: '1px solid var(--border)',
  borderRadius: '7px', width: '26px', height: '26px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--foreground)', padding: 0,
}
