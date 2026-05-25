'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, Clock, Trash2, X, Pencil, Check, Paperclip } from 'lucide-react'
import { CalendarEvent } from '@/types'
import DatePicker from '@/components/ui/DatePicker'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const EVENT_COLORS = ['#f97316', '#fb923c', '#f59e0b', '#22c55e', '#ef4444', '#3b82f6']

export default function CalendarView() {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today.getDate())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', date: '', time: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', date: '', time: '', description: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null)
  const [editUploading, setEditUploading] = useState(false)
  const [editDragOver, setEditDragOver] = useState(false)
  const [createImageUrl, setCreateImageUrl] = useState<string | null>(null)
  const [createUploading, setCreateUploading] = useState(false)
  const [createDragOver, setCreateDragOver] = useState(false)

  const closeLightbox = useCallback(() => setLightboxUrl(null), [])

  useEffect(() => {
    if (!lightboxUrl) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxUrl, closeLightbox])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    fetchEvents()
  }, [month, year])

  async function fetchEvents() {
    setLoading(true)
    try {
      const res = await fetch(`/api/events?month=${month + 1}&year=${year}`)
      const data = await res.json()
      setEvents(data.events || [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!newEvent.title.trim() || !newEvent.date || !newEvent.time) return
    setSaving(true)
    try {
      const startTime = `${newEvent.date}T${newEvent.time}:00`
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newEvent.title, description: newEvent.description, start_time: startTime, image_url: createImageUrl }),
      })
      setNewEvent({ title: '', date: '', time: '', description: '' })
      setCreateImageUrl(null)
      setShowForm(false)
      fetchEvents()
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(eventId: string) {
    setDeletingId(eventId)
    try {
      await fetch(`/api/events/${eventId}`, { method: 'DELETE' })
      setEvents(prev => prev.filter(e => e.id !== eventId))
    } finally {
      setDeletingId(null)
    }
  }

  async function uploadFile(file: File, setUrl: (u: string) => void, setUploading: (b: boolean) => void) {
    if (file.size > 2 * 1024 * 1024) { alert('El archivo supera 2 MB'); return }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.url) setUrl(data.url)
    else alert(data.error || 'Error al subir archivo')
    setUploading(false)
  }

  function startEdit(event: CalendarEvent) {
    const d = new Date(event.start)
    const pad = (n: number) => String(n).padStart(2, '0')
    setEditDraft({
      title: event.title,
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      description: event.description || '',
    })
    setEditImageUrl((event as any).image_url || null)
    setEditingId(event.id)
  }

  async function saveEdit(eventId: string) {
    if (!editDraft.title.trim() || !editDraft.date || !editDraft.time) return
    setEditSaving(true)
    try {
      const start_time = `${editDraft.date}T${editDraft.time}:00`
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editDraft.title, start_time, description: editDraft.description, image_url: editImageUrl }),
      })
      const data = await res.json()
      if (data.event) {
        setEvents(prev => prev.map(e => e.id === eventId ? {
          ...e,
          title: editDraft.title,
          start: start_time,
          description: editDraft.description,
          image_url: editImageUrl,
        } as any : e))
      }
      setEditingId(null)
    } finally {
      setEditSaving(false)
    }
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  function getEventsForDay(day: number): CalendarEvent[] {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => e.start.startsWith(dateStr))
  }

  const selectedDateEvents = getEventsForDay(selectedDay)

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(6px)',
            cursor: 'zoom-out',
          }}
        >
          <button
            onClick={closeLightbox}
            style={{
              position: 'absolute', top: '1.25rem', right: '1.25rem',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '50%', width: '40px', height: '40px',
              color: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
          <img
            src={lightboxUrl}
            alt="Adjunto"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '88vh',
              borderRadius: '14px', boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
              cursor: 'default',
            }}
          />
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Calendario</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            Gestiona tus eventos y agenda de obra
          </p>
        </div>
        <button onClick={() => setShowForm(f => !f)} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 18px', borderRadius: '10px',
          background: 'var(--primary)',
          border: 'none', color: 'white', cursor: 'pointer',
          fontSize: '0.875rem', fontWeight: 600,
          boxShadow: '0 0 15px var(--primary-glow)',
        }}>
          <Plus size={16} /> Nuevo evento
        </button>
      </div>

      {showForm && (
        <form onSubmit={createEvent} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <input type="text" placeholder="Título del evento..." value={newEvent.title} required
              onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
              style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)', fontSize: '0.95rem', outline: 'none' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <DatePicker value={newEvent.date} onChange={d => setNewEvent(p => ({ ...p, date: d }))} />
              <input type="time" value={newEvent.time} required
                onChange={e => setNewEvent(p => ({ ...p, time: e.target.value }))}
                style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none' }}
              />
            </div>
            <textarea placeholder="Descripción (opcional)..." value={newEvent.description} rows={2}
              onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))}
              style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none', resize: 'vertical' }}
            />
            <DropZone
              imageUrl={createImageUrl}
              uploading={createUploading}
              dragOver={createDragOver}
              onFile={f => uploadFile(f, setCreateImageUrl, setCreateUploading)}
              onDragOver={() => setCreateDragOver(true)}
              onDragLeave={() => setCreateDragOver(false)}
              onRemove={() => setCreateImageUrl(null)}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowForm(false); setCreateImageUrl(null) }} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}>Cancelar</button>
              <button type="submit" disabled={saving} style={{ padding: '8px 20px', borderRadius: '8px', background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                {saving ? 'Guardando...' : 'Crear evento'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
        {/* Calendario */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          overflow: 'hidden'
        }}>
          {/* Nav mes */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)'
          }}>
            <button onClick={prevMonth} style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'var(--surface-hover)', border: '1px solid var(--border)',
              color: 'var(--foreground)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ChevronLeft size={18} />
            </button>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {MONTHS[month]} {year}
            </h2>
            <button onClick={nextMonth} style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'var(--surface-hover)', border: '1px solid var(--border)',
              color: 'var(--foreground)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Días de la semana */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            padding: '1rem 1.5rem 0.5rem'
          }}>
            {DAYS.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: '0.75rem',
                color: 'var(--text-muted)', fontWeight: 600,
                padding: '0.5rem 0'
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid días */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            padding: '0 1.5rem 1.5rem', gap: '4px'
          }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayEvents = getEventsForDay(day)
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              const isSelected = day === selectedDay

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '10px',
                    border: isSelected && !isToday ? '1px solid var(--primary)' : '1px solid transparent',
                    background: isToday
                      ? 'var(--primary)'
                      : isSelected ? 'rgba(249,115,22,0.12)' : 'transparent',
                    color: isToday ? 'white' : 'var(--foreground)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: isToday || isSelected ? 600 : 400,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '3px',
                    boxShadow: isToday ? '0 0 15px var(--primary-glow)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  {day}
                  {dayEvents.length > 0 && (
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {dayEvents.slice(0, 3).map((e, idx) => (
                        <div key={idx} style={{
                          width: '4px', height: '4px', borderRadius: '50%',
                          background: isToday ? 'rgba(255,255,255,0.8)' : (e.color || EVENT_COLORS[idx % EVENT_COLORS.length])
                        }} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel lateral: eventos del día */}
        <div>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)'
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                {selectedDay === today.getDate() && month === today.getMonth() ? 'Hoy' : `${selectedDay} de ${MONTHS[month]}`}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {selectedDateEvents.length} evento{selectedDateEvents.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div style={{ padding: '1rem' }}>
              {selectedDateEvents.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '2rem 1rem',
                  color: 'var(--text-muted)', fontSize: '0.85rem'
                }}>
                  <CalendarIcon size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  Sin eventos este día.<br/>
                  <span style={{ fontSize: '0.8rem' }}>Escribe en WhatsApp para agendar.</span>
                </div>
              ) : (
                selectedDateEvents.map((event, i) => (
                  <div key={event.id} style={{
                    padding: '0.875rem',
                    borderRadius: '12px',
                    background: 'var(--surface-hover)',
                    border: `1px solid ${event.color || EVENT_COLORS[i % EVENT_COLORS.length]}30`,
                    marginBottom: '8px',
                    borderLeft: `3px solid ${event.color || EVENT_COLORS[i % EVENT_COLORS.length]}`
                  }}>
                    {editingId === event.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                          autoFocus
                          value={editDraft.title}
                          onChange={e => setEditDraft(p => ({ ...p, title: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(event.id); if (e.key === 'Escape') setEditingId(null) }}
                          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--primary)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none', fontWeight: 600 }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <DatePicker value={editDraft.date} onChange={d => setEditDraft(p => ({ ...p, date: d }))} />
                          <input type="time" value={editDraft.time}
                            onChange={e => setEditDraft(p => ({ ...p, time: e.target.value }))}
                            style={{ padding: '6px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
                          />
                        </div>
                        <input value={editDraft.description} placeholder="Descripción (opcional)"
                          onChange={e => setEditDraft(p => ({ ...p, description: e.target.value }))}
                          style={{ padding: '6px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
                        />
                        <DropZone
                          imageUrl={editImageUrl}
                          uploading={editUploading}
                          dragOver={editDragOver}
                          onFile={f => uploadFile(f, setEditImageUrl, setEditUploading)}
                          onDragOver={() => setEditDragOver(true)}
                          onDragLeave={() => setEditDragOver(false)}
                          onRemove={() => setEditImageUrl(null)}
                        />
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditingId(null)} style={{ padding: '5px 12px', borderRadius: '7px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem' }}>Cancelar</button>
                          <button onClick={() => saveEdit(event.id)} disabled={editSaving} style={{ padding: '5px 14px', borderRadius: '7px', background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Check size={13} /> {editSaving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '4px', flex: 1 }}>
                            {event.title}
                          </p>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            <button onClick={() => startEdit(event)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', borderRadius: '6px' }} title="Editar evento">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteEvent(event.id)} disabled={deletingId === event.id} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', borderRadius: '6px', opacity: deletingId === event.id ? 0.4 : 1 }} title="Eliminar evento">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          <Clock size={12} />
                          {new Date(event.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          {event.end && ` → ${new Date(event.end).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                        </div>
                        {event.description && (
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>{event.description}</p>
                        )}
                        {(event as any).image_url && (
                          <img src={(event as any).image_url} alt="Adjunto" onClick={() => setLightboxUrl((event as any).image_url)}
                            style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '8px', marginTop: '8px', border: '1px solid var(--border)', cursor: 'zoom-in' }}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DropZoneProps {
  imageUrl: string | null
  uploading: boolean
  dragOver: boolean
  onFile: (f: File) => void
  onDragOver: () => void
  onDragLeave: () => void
  onRemove: () => void
}

function DropZone({ imageUrl, uploading, dragOver, onFile, onDragOver, onDragLeave, onRemove }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    onDragLeave()
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div>
      {imageUrl ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={imageUrl} alt="Adjunto" style={{ maxHeight: '100px', borderRadius: '8px', border: '1px solid var(--border)', display: 'block' }} />
          <button type="button" onClick={onRemove} style={{
            position: 'absolute', top: '-6px', right: '-6px',
            width: '20px', height: '20px', borderRadius: '50%',
            background: '#ef4444', border: 'none', color: 'white',
            cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); onDragOver() }}
          onDragLeave={onDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '9px',
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: '8px',
            cursor: 'pointer',
            background: dragOver ? 'rgba(249,115,22,0.05)' : 'transparent',
            transition: 'all 0.15s',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
          }}
        >
          <Paperclip size={14} />
          {uploading ? 'Subiendo...' : 'Adjuntar archivo (máx. 2 MB) o arrastra aquí'}
          <input ref={inputRef} type="file" accept="image/*,.pdf,.doc,.docx" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          />
        </div>
      )}
    </div>
  )
}

function CalendarIcon({ size, style }: { size: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={style}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
}
