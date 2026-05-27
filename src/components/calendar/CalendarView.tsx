'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Plus, Clock, Trash2, X, Pencil, Check, Paperclip, Circle, CheckCircle } from 'lucide-react'
import { CalendarEvent } from '@/types'
import DatePicker from '@/components/ui/DatePicker'
import { createClient } from '@/lib/supabase'

const fetcher = (url: string) => fetch(url).then(r => r.json())

/* ─── Constants ─── */
const DAY_SHORT  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAY_FULL   = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS     = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const COLORS     = ['#f97316','#3b82f6','#22c55e','#ef4444','#8b5cf6','#f59e0b']
const START_H    = 0
const END_H      = 24
const ROW_H      = 56   // px per hour

const DURATIONS = (() => {
  const list: { label: string; minutes: number }[] = []
  for (let m = 15; m <= 480; m += 15) {
    const h = Math.floor(m / 60), min = m % 60
    list.push({
      minutes: m,
      label: h > 0 && min > 0 ? `${h}h ${min}min` : h > 0 ? `${h}h` : `${min}min`,
    })
  }
  return list
})()

type View = 'month' | 'week' | 'day'

/* ─── Helpers ─── */
function weekStart(d: Date): Date {
  const r = new Date(d)
  r.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  r.setHours(0, 0, 0, 0)
  return r
}
function weekDays(anchor: Date): Date[] {
  const mon = weekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d })
}
function dateStr(d: Date): string { return d.toLocaleDateString('en-CA') }
function isWeekend(d: Date)       { return d.getDay() === 0 || d.getDay() === 6 }
function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}
function endTime(date: string, time: string, mins: number): string {
  const d = new Date(`${date}T${time}:00`)
  d.setMinutes(d.getMinutes() + mins)
  return d.toISOString()
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function durationLabel(event: CalendarEvent): string {
  if (!event.end) return ''
  const mins = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 && m > 0 ? `${h}h ${m}min` : h > 0 ? `${h}h` : `${m}min`
}
function pad(n: number) { return String(n).padStart(2, '0') }
function pxToTimeStr(px: number): string {
  const totalH = START_H + px / ROW_H
  const h = Math.max(0, Math.min(23, Math.floor(totalH)))
  const m = Math.max(0, Math.min(59, Math.round((totalH - Math.floor(totalH)) * 60)))
  return m === 60 ? `${pad(Math.min(h + 1, 23))}:00` : `${pad(h)}:${pad(m)}`
}
function snapTime15(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const snap = Math.round(m / 15) * 15
  if (snap >= 60) return `${pad(Math.min(h + 1, 23))}:00`
  return `${pad(h)}:${pad(snap)}`
}
function autoEndTime(start: string): string {
  if (!start) return ''
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + 60
  return `${pad(Math.min(Math.floor(total / 60), 23))}:${pad(total % 60)}`
}

/* ─── Main component ─── */
export default function CalendarView() {
  const today = new Date()

  const [view,        setView]        = useState<View>('month')
  const [curDate,     setCurDate]     = useState(today)
  const [selDay,      setSelDay]      = useState(today.getDate())
  const [showForm,       setShowForm]       = useState(false)
  const [showQuickCreate,setShowQuickCreate] = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [popupEvent,  setPopupEvent]  = useState<CalendarEvent | null>(null)
  const [popupEditing,setPopupEditing]= useState(false)

  const [newEv, setNewEv] = useState({ title: '', date: '', time: '', endTime: '', description: '' })
  const [createImg, setCreateImg] = useState<string | null>(null)
  const [createUpl, setCreateUpl] = useState(false)
  const [createDrag,setCreateDrag]= useState(false)

  const [editDraft, setEditDraft] = useState({ title: '', date: '', time: '', endTime: '', description: '' })
  const [editImg,   setEditImg]   = useState<string | null>(null)
  const [editUpl,   setEditUpl]   = useState(false)
  const [editDrag,  setEditDrag]  = useState(false)
  const [editSaving,setEditSaving]= useState(false)

  const closeLightbox = useCallback(() => setLightboxUrl(null), [])
  useEffect(() => {
    if (!lightboxUrl) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [lightboxUrl, closeLightbox])
  useEffect(() => {
    if (!popupEvent) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPopupEvent(null); setPopupEditing(false) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [popupEvent])

  /* SWR key */
  const year = curDate.getFullYear()
  const month = curDate.getMonth()
  const swrKey = (() => {
    if (view === 'month') return `/api/events?month=${month + 1}&year=${year}`
    if (view === 'week') {
      const ws = weekStart(curDate), we = new Date(ws)
      we.setDate(ws.getDate() + 6)
      return `/api/events?start=${dateStr(ws)}&end=${dateStr(we)}`
    }
    return `/api/events?start=${dateStr(curDate)}&end=${dateStr(curDate)}`
  })()
  const { data: eventsData, mutate } = useSWR(swrKey, fetcher)
  const events: CalendarEvent[] = eventsData?.events ?? []

  /* Supabase Realtime — refetch instantly when calendar_events changes (e.g. from Google Calendar webhook) */
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('calendar_events_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        mutate()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [mutate])

  /* Navigation */
  function goBack() {
    setCurDate(d => {
      const n = new Date(d)
      if (view === 'month') n.setMonth(n.getMonth() - 1)
      else if (view === 'week') n.setDate(n.getDate() - 7)
      else n.setDate(n.getDate() - 1)
      return n
    })
  }
  function goForward() {
    setCurDate(d => {
      const n = new Date(d)
      if (view === 'month') n.setMonth(n.getMonth() + 1)
      else if (view === 'week') n.setDate(n.getDate() + 7)
      else n.setDate(n.getDate() + 1)
      return n
    })
  }
  function goToday() { setCurDate(new Date()); setSelDay(today.getDate()) }

  function navTitle(): string {
    if (view === 'month') return `${MONTHS[month]} ${year}`
    if (view === 'week') {
      const days = weekDays(curDate)
      const [f, l] = [days[0], days[6]]
      return f.getMonth() === l.getMonth()
        ? `${f.getDate()}–${l.getDate()} ${MONTHS[f.getMonth()]} ${f.getFullYear()}`
        : `${f.getDate()} ${MONTHS[f.getMonth()]} – ${l.getDate()} ${MONTHS[l.getMonth()]} ${l.getFullYear()}`
    }
    return `${DAY_FULL[(curDate.getDay() + 6) % 7]}, ${curDate.getDate()} de ${MONTHS[curDate.getMonth()]} ${curDate.getFullYear()}`
  }

  /* CRUD */
  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!newEv.title.trim() || !newEv.date || !newEv.time) return
    setSaving(true)
    try {
      const start_time = `${newEv.date}T${newEv.time}:00`
      const end_time   = newEv.endTime ? `${newEv.date}T${newEv.endTime}:00` : undefined
      await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newEv.title, description: newEv.description, start_time, end_time, image_url: createImg }),
      })
      setNewEv({ title: '', date: '', time: '', endTime: '', description: '' })
      setCreateImg(null); setShowForm(false); setShowQuickCreate(false); mutate()
    } finally { setSaving(false) }
  }

  async function resizeEvent(id: string, newStart: string, newEnd: string) {
    await fetch(`/api/events/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_time: newStart, end_time: newEnd }),
    })
    mutate()
  }

  async function deleteEvent(id: string) {
    setDeletingId(id)
    try { await fetch(`/api/events/${id}`, { method: 'DELETE' }); mutate() }
    finally { setDeletingId(null) }
  }

  async function toggleEventComplete(event: CalendarEvent) {
    await fetch(`/api/events/${event.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !event.completed }),
    })
    mutate()
  }

  async function uploadFile(file: File, setUrl: (u: string) => void, setUpl: (b: boolean) => void) {
    setUpl(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.url) setUrl(data.url); else alert(data.error || 'Error al subir')
    setUpl(false)
  }

  function openEditPopup(event: CalendarEvent) {
    const d = new Date(event.start)
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    const endStr  = event.end ? `${pad(new Date(event.end).getHours())}:${pad(new Date(event.end).getMinutes())}` : autoEndTime(timeStr)
    setEditDraft({ title: event.title, date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, time: timeStr, endTime: endStr, description: event.description || '' })
    setEditImg((event as any).image_url || null)
    setPopupEditing(true)
  }

  async function saveEditPopup() {
    if (!popupEvent || !editDraft.title.trim() || !editDraft.date || !editDraft.time) return
    setEditSaving(true)
    try {
      const start_time = `${editDraft.date}T${editDraft.time}:00`
      const end_time   = editDraft.endTime ? `${editDraft.date}T${editDraft.endTime}:00` : undefined
      await fetch(`/api/events/${popupEvent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editDraft.title, start_time, end_time, description: editDraft.description, image_url: editImg }),
      })
      setPopupEvent(null); setPopupEditing(false); mutate()
    } finally { setEditSaving(false) }
  }

  function openQuickCreate(date: string, time: string) {
    const snapped = snapTime15(time)
    setNewEv({ title: '', date, time: snapped, endTime: autoEndTime(snapped), description: '' })
    setCreateImg(null)
    setShowQuickCreate(true)
  }

  function eventsForDay(d: Date) { return events.filter(e => dateStr(new Date(e.start)) === dateStr(d)) }

  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  /* Month-specific */
  const firstDay    = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const isWkendCol  = (col: number) => col === 5 || col === 6
  const selDate     = new Date(year, month, selDay)
  const selEvents   = eventsForDay(selDate)

  /* End-time preview for form */
  function calcEndPreview(date: string, time: string, dur: number): string {
    try {
      const d = new Date(`${date}T${time}:00`)
      d.setMinutes(d.getMinutes() + dur)
      return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  /* ── Render ── */
  return (
    <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={closeLightbox} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)', cursor:'zoom-out' }}>
          <button onClick={closeLightbox} style={{ position:'absolute', top:'1.25rem', right:'1.25rem', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'50%', width:'40px', height:'40px', color:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={20} />
          </button>
          <img src={lightboxUrl} alt="Adjunto" onClick={e => e.stopPropagation()} style={{ maxWidth:'90vw', maxHeight:'88vh', borderRadius:'14px', boxShadow:'0 30px 80px rgba(0,0,0,0.6)', cursor:'default' }} />
        </div>
      )}

      {/* Event popup (week/day) */}
      {popupEvent && (
        <div onClick={() => { setPopupEvent(null); setPopupEditing(false) }} style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'18px', width:'380px', maxWidth:'92vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', animation:'fadeIn 0.18s ease', overflow:'hidden' }}>
            <div style={{ height:'4px', background: popupEvent.color || COLORS[0] }} />
            <div style={{ padding:'1.25rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
                {popupEditing ? (
                  <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-muted)' }}>Editar evento</span>
                ) : (
                  <h3 style={{ fontSize:'1rem', fontWeight:700, margin:0, flex:1, paddingRight:'8px' }}>{popupEvent.title}</h3>
                )}
                <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
                  {!popupEditing && (
                    <button onClick={() => openEditPopup(popupEvent)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'4px', borderRadius:'6px' }}><Pencil size={14} /></button>
                  )}
                  <button onClick={() => { setPopupEvent(null); setPopupEditing(false) }} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'4px', borderRadius:'6px' }}><X size={16} /></button>
                </div>
              </div>

              {popupEditing ? (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  <input value={editDraft.title} onChange={e => setEditDraft(p => ({ ...p, title: e.target.value }))}
                    style={{ padding:'8px 12px', borderRadius:'9px', border:'1px solid var(--border)', background:'var(--background)', color:'var(--foreground)', fontSize:'0.9rem', outline:'none', fontWeight:600 }} />
                  <DatePicker value={editDraft.date} onChange={d => setEditDraft(p => ({ ...p, date: d }))} />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    <TimePicker label="Inicio" value={editDraft.time} onChange={t => setEditDraft(p => ({ ...p, time: t, endTime: p.endTime && p.endTime > t ? p.endTime : autoEndTime(t) }))} />
                    <TimePicker label="Término" value={editDraft.endTime} onChange={t => setEditDraft(p => ({ ...p, endTime: t }))} />
                  </div>
                  {editDraft.time && editDraft.endTime && (
                    <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>
                      🕐 {editDraft.time} → {editDraft.endTime}
                    </p>
                  )}
                  <input value={editDraft.description} placeholder="Descripción (opcional)"
                    onChange={e => setEditDraft(p => ({ ...p, description: e.target.value }))}
                    style={{ padding:'8px 12px', borderRadius:'9px', border:'1px solid var(--border)', background:'var(--background)', color:'var(--foreground)', fontSize:'0.85rem', outline:'none' }} />
                  <DropZone imageUrl={editImg} uploading={editUpl} dragOver={editDrag}
                    onFile={f => uploadFile(f, setEditImg, setEditUpl)} onDragOver={() => setEditDrag(true)} onDragLeave={() => setEditDrag(false)} onRemove={() => setEditImg(null)} />
                  <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end', marginTop:'4px' }}>
                    <button onClick={() => setPopupEditing(false)} style={{ padding:'7px 14px', borderRadius:'8px', background:'transparent', border:'1px solid var(--border)', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancelar</button>
                    <button onClick={saveEditPopup} disabled={editSaving} style={{ padding:'7px 16px', borderRadius:'8px', background:'var(--primary)', border:'none', color:'white', cursor:'pointer', fontSize:'0.82rem', fontWeight:600 }}>
                      {editSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--text-muted)', fontSize:'0.82rem', marginBottom:'8px' }}>
                    <Clock size={13} />
                    {fmtTime(popupEvent.start)}
                    {popupEvent.end && ` → ${fmtTime(popupEvent.end)}`}
                    {popupEvent.end && <span style={{ marginLeft:'4px', padding:'1px 7px', borderRadius:'100px', background:'rgba(249,115,22,0.1)', color:'var(--primary)', fontSize:'0.72rem', fontWeight:600 }}>{durationLabel(popupEvent)}</span>}
                  </div>
                  {popupEvent.description && <p style={{ fontSize:'0.85rem', color:'var(--foreground)', lineHeight:1.6, margin:'0 0 10px' }}>{popupEvent.description}</p>}
                  {(popupEvent as any).image_url && (
                    <img src={(popupEvent as any).image_url} alt="Adjunto" onClick={() => setLightboxUrl((popupEvent as any).image_url)}
                      style={{ width:'100%', maxHeight:'120px', objectFit:'cover', borderRadius:'8px', border:'1px solid var(--border)', cursor:'zoom-in', marginBottom:'10px' }} />
                  )}
                  <button onClick={async () => { const id = popupEvent.id; setPopupEvent(null); await deleteEvent(id) }}
                    disabled={deletingId === popupEvent.id}
                    style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 14px', borderRadius:'8px', background:'transparent', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', cursor:'pointer', fontSize:'0.8rem', width:'100%', justifyContent:'center' }}>
                    <Trash2 size={13} /> Eliminar evento
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick-create modal (double-click) */}
      {showQuickCreate && (
        <div onClick={() => setShowQuickCreate(false)} style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
          <form onSubmit={createEvent} onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'20px', width:'420px', maxWidth:'94vw', boxShadow:'0 24px 80px rgba(0,0,0,0.25)', animation:'fadeIn 0.18s ease', overflow:'hidden' }}>
            <div style={{ height:'4px', background:'var(--primary)' }} />
            <div style={{ padding:'1.5rem', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-muted)' }}>Nuevo evento</span>
                <button type="button" onClick={() => setShowQuickCreate(false)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'4px', borderRadius:'6px', display:'flex', alignItems:'center' }}><X size={16} /></button>
              </div>
              <input autoFocus type="text" placeholder="Título del evento..." value={newEv.title} required
                onChange={e => setNewEv(p => ({ ...p, title: e.target.value }))}
                style={{ padding:'10px 14px', borderRadius:'10px', background:'var(--background)', border:'1px solid var(--border)', color:'var(--foreground)', fontSize:'1rem', outline:'none', fontWeight:600 }} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                <DatePicker value={newEv.date} onChange={d => setNewEv(p => ({ ...p, date: d }))} />
                <TimePicker label="Inicio" value={newEv.time} onChange={t => setNewEv(p => ({ ...p, time: t, endTime: p.endTime && p.endTime > t ? p.endTime : autoEndTime(t) }))} />
                <TimePicker label="Término" value={newEv.endTime} onChange={t => setNewEv(p => ({ ...p, endTime: t }))} />
              </div>
              {newEv.time && newEv.endTime && (
                <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>🕐 {newEv.time} → {newEv.endTime}</p>
              )}
              <input type="text" placeholder="Descripción (opcional)" value={newEv.description}
                onChange={e => setNewEv(p => ({ ...p, description: e.target.value }))}
                style={{ padding:'9px 14px', borderRadius:'10px', background:'var(--background)', border:'1px solid var(--border)', color:'var(--foreground)', fontSize:'0.875rem', outline:'none' }} />
              <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'4px' }}>
                <button type="button" onClick={() => setShowQuickCreate(false)} style={{ padding:'8px 16px', borderRadius:'8px', background:'transparent', border:'1px solid var(--border)', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.875rem' }}>Cancelar</button>
                <button type="submit" disabled={saving} style={{ padding:'8px 20px', borderRadius:'8px', background:'var(--primary)', border:'none', color:'white', cursor:'pointer', fontSize:'0.875rem', fontWeight:600, boxShadow:'0 0 12px var(--primary-glow)' }}>
                  {saving ? 'Guardando...' : 'Crear evento'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem', flexWrap:'wrap', gap:'1rem', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:'1.5rem', fontWeight:700, margin:0 }}>Calendario</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'0.875rem', margin:'2px 0 0' }}>Gestiona tus eventos y agenda de obra</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
          {/* View toggle */}
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:'3px' }}>
            {(['month','week','day'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding:'6px 16px', borderRadius:'7px', border:'none',
                background: view === v ? 'var(--primary)' : 'transparent',
                color: view === v ? 'white' : 'var(--text-muted)',
                cursor:'pointer', fontSize:'0.82rem', fontWeight: view === v ? 600 : 400,
                transition:'all 0.15s',
                boxShadow: view === v ? '0 0 12px rgba(249,115,22,0.3)' : 'none',
              }}>
                {v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : 'Día'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(f => !f)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', borderRadius:'10px', background:'var(--primary)', border:'none', color:'white', cursor:'pointer', fontSize:'0.875rem', fontWeight:600, boxShadow:'0 0 15px var(--primary-glow)' }}>
            <Plus size={16} /> Nuevo evento
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={createEvent} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'16px', padding:'1.5rem', marginBottom:'1rem', animation:'fadeIn 0.3s ease', flexShrink:0 }}>
          <div style={{ display:'grid', gap:'1rem' }}>
            <input type="text" placeholder="Título del evento..." value={newEv.title} required onChange={e => setNewEv(p => ({ ...p, title: e.target.value }))}
              style={{ padding:'10px 14px', borderRadius:'10px', background:'var(--background)', border:'1px solid var(--border)', color:'var(--foreground)', fontSize:'0.95rem', outline:'none' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1rem' }}>
              <DatePicker value={newEv.date} onChange={d => setNewEv(p => ({ ...p, date: d }))} />
              <TimePicker label="Inicio" value={newEv.time} onChange={t => setNewEv(p => ({ ...p, time: t, endTime: p.endTime && p.endTime > t ? p.endTime : autoEndTime(t) }))} />
              <TimePicker label="Término" value={newEv.endTime} onChange={t => setNewEv(p => ({ ...p, endTime: t }))} />
            </div>
            {newEv.time && newEv.endTime && (
              <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:0 }}>
                🕐 <strong>{newEv.time}</strong> → <strong>{newEv.endTime}</strong>
              </p>
            )}
            <textarea placeholder="Descripción (opcional)..." value={newEv.description} rows={2} onChange={e => setNewEv(p => ({ ...p, description: e.target.value }))}
              style={{ padding:'10px 14px', borderRadius:'10px', background:'var(--background)', border:'1px solid var(--border)', color:'var(--foreground)', fontSize:'0.875rem', outline:'none', resize:'vertical' }} />
            <DropZone imageUrl={createImg} uploading={createUpl} dragOver={createDrag}
              onFile={f => uploadFile(f, setCreateImg, setCreateUpl)} onDragOver={() => setCreateDrag(true)} onDragLeave={() => setCreateDrag(false)} onRemove={() => setCreateImg(null)} />
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button type="button" onClick={() => { setShowForm(false); setCreateImg(null) }} style={{ padding:'8px 16px', borderRadius:'8px', background:'transparent', border:'1px solid var(--border)', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.875rem' }}>Cancelar</button>
              <button type="submit" disabled={saving} style={{ padding:'8px 20px', borderRadius:'8px', background:'var(--primary)', border:'none', color:'white', cursor:'pointer', fontSize:'0.875rem', fontWeight:600 }}>
                {saving ? 'Guardando...' : 'Crear evento'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Nav bar — semana / día */}
      {view !== 'month' && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <button onClick={goBack} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize:'0.95rem', fontWeight:600, minWidth:'220px', textAlign:'center' }}>{navTitle()}</span>
            <button onClick={goForward} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronRight size={16} />
            </button>
            <button onClick={goToday} style={{ padding:'6px 14px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.8rem', fontWeight:500 }}>
              Hoy
            </button>
          </div>
        </div>
      )}

      {/* ── Month view ── */}
      {view === 'month' && (
        <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1fr 320px', gap:'1.5rem', overflow:'hidden' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', minHeight:0, overflow:'hidden' }}>
            {/* Nav bar — dentro de la columna del calendario */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <button onClick={goBack} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize:'0.95rem', fontWeight:600, minWidth:'220px', textAlign:'center' }}>{navTitle()}</span>
                <button onClick={goForward} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <ChevronRight size={16} />
                </button>
                <button onClick={goToday} style={{ padding:'6px 14px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.8rem', fontWeight:500 }}>
                  Hoy
                </button>
              </div>
            </div>
            <div style={{ flex:1, minHeight:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'20px', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'0.75rem 1.5rem 0.25rem', flexShrink:0 }}>
              {DAY_SHORT.map((d, idx) => (
                <div key={d} style={{ textAlign:'center', fontSize:'0.75rem', fontWeight:600, padding:'0.5rem 0', color: isWkendCol(idx) ? 'rgba(239,68,68,0.55)' : 'var(--text-muted)', background: isWkendCol(idx) ? 'rgba(239,68,68,0.05)' : 'transparent' }}>{d}</div>
              ))}
            </div>
            {/* Grid */}
            <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridAutoRows:'1fr', padding:'0 1.5rem 1rem', gap:0 }}>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} style={{ background: isWkendCol(i) ? 'rgba(239,68,68,0.05)' : 'transparent' }} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const col = (firstDay + i) % 7
                const wknd = isWkendCol(col)
                const evs = eventsForDay(new Date(year, month, day))
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                const isSel = day === selDay
                return (
                  <div key={day} style={{ padding:'2px', background: wknd ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                    <button
                      onClick={() => setSelDay(day)}
                      onDoubleClick={() => openQuickCreate(`${year}-${pad(month+1)}-${pad(day)}`, '08:00')}
                      onMouseEnter={() => setHoveredDay(day)}
                      onMouseLeave={() => setHoveredDay(null)}
                      style={{
                      width:'100%', height:'100%', borderRadius:'10px',
                      border: isSel && !isToday ? '1px solid var(--primary)' : hoveredDay === day && !isToday ? '1px dashed rgba(249,115,22,0.4)' : '1px solid transparent',
                      background: isToday ? 'var(--primary)' : isSel ? 'rgba(249,115,22,0.12)' : hoveredDay === day ? 'rgba(249,115,22,0.06)' : 'transparent',
                      color: isToday ? 'white' : wknd && !isSel ? 'rgba(239,68,68,0.75)' : 'var(--foreground)',
                      cursor:'pointer', fontSize:'0.875rem', fontWeight: isToday || isSel ? 600 : 400,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'3px',
                      boxShadow: isToday ? '0 0 15px var(--primary-glow)' : 'none', transition:'all 0.15s',
                    }}>
                      {day}
                      {evs.length > 0 && (
                        <div style={{ display:'flex', gap:'2px' }}>
                          {evs.slice(0, 3).map((ev, idx) => (
                            <div key={idx} style={{ width:'4px', height:'4px', borderRadius:'50%', background: isToday ? 'rgba(255,255,255,0.8)' : (ev.color || COLORS[idx % COLORS.length]) }} />
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
          </div>

          {/* Events panel */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'20px', overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
            <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <h3 style={{ fontSize:'0.95rem', fontWeight:600, margin:0 }}>
                {isSameDay(selDate, today) ? 'Hoy' : `${selDay} de ${MONTHS[month]}`}
              </h3>
              <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:'4px 0 0' }}>{selEvents.length} evento{selEvents.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ padding:'1rem', flex:1, overflowY:'auto' }}>
              {selEvents.length === 0 ? (
                <div style={{ textAlign:'center', padding:'2rem 1rem', color:'var(--text-muted)', fontSize:'0.85rem' }}>
                  <CalIcon size={32} style={{ margin:'0 auto 0.75rem', opacity:0.4 }} />
                  Sin eventos este día.<br /><span style={{ fontSize:'0.8rem' }}>Escribe en WhatsApp para agendar.</span>
                </div>
              ) : selEvents.map((ev, i) => (
                <MonthEventCard key={ev.id} event={ev} index={i} deletingId={deletingId}
                  onEdit={() => { setPopupEvent(ev); setPopupEditing(false); openEditPopup(ev) }}
                  onDelete={deleteEvent}
                  onLightbox={setLightboxUrl}
                  onToggleComplete={toggleEventComplete}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Week view ── */}
      {view === 'week' && (
        <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
          <WeekView events={events} today={today} days={weekDays(curDate)}
            onEventClick={ev => { setPopupEvent(ev); setPopupEditing(false) }}
            onDayClick={d => { setCurDate(d); setView('day') }}
            onResize={resizeEvent}
            onMove={resizeEvent}
            onDoubleClickCell={openQuickCreate}
          />
        </div>
      )}

      {/* ── Day view ── */}
      {view === 'day' && (
        <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
          <DayView events={eventsForDay(curDate)} today={today} date={curDate}
            onEventClick={ev => { setPopupEvent(ev); setPopupEditing(false) }}
            onResize={resizeEvent}
            onMove={resizeEvent}
            onDoubleClickCell={openQuickCreate}
          />
        </div>
      )}
    </div>
  )
}

/* ─── Month event card (sidebar) ─── */
function MonthEventCard({ event, index, deletingId, onEdit, onDelete, onLightbox, onToggleComplete }: {
  event: CalendarEvent; index: number; deletingId: string | null
  onEdit: () => void; onDelete: (id: string) => void; onLightbox: (url: string) => void
  onToggleComplete: (ev: CalendarEvent) => void
}) {
  const color = event.color || COLORS[index % COLORS.length]
  const done = !!event.completed
  return (
    <div style={{ padding:'0.875rem', borderRadius:'12px', background:'var(--surface-hover)', border:`1px solid ${color}30`, marginBottom:'8px', borderLeft:`3px solid ${done ? 'var(--border)' : color}`, opacity: done ? 0.6 : 1, transition:'opacity 0.2s' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', flex:1, minWidth:0 }}>
          <button onClick={() => onToggleComplete(event)} style={{ background:'none', border:'none', cursor:'pointer', padding:'1px', flexShrink:0, marginTop:'2px' }}>
            {done
              ? <CheckCircle size={16} color="#22c55e" />
              : <Circle size={16} color="var(--text-muted)" />}
          </button>
          <p style={{ fontSize:'0.875rem', fontWeight:600, marginBottom:'4px', flex:1, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--text-muted)' : 'var(--foreground)' }}>{event.title}</p>
        </div>
        <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
          <button onClick={onEdit} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'2px', borderRadius:'6px' }}><Pencil size={13} /></button>
          <button onClick={() => onDelete(event.id)} disabled={deletingId === event.id} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'2px', borderRadius:'6px', opacity: deletingId === event.id ? 0.4 : 1 }}><Trash2 size={14} /></button>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--text-muted)', fontSize:'0.78rem', marginLeft:'24px' }}>
        <Clock size={12} />
        {fmtTime(event.start)}
        {event.end && ` → ${fmtTime(event.end)}`}
        {event.end && <span style={{ marginLeft:'4px', fontSize:'0.7rem', color: done ? 'var(--text-muted)' : color, fontWeight:600 }}>{durationLabel(event)}</span>}
      </div>
      {event.description && <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'6px', marginLeft:'24px' }}>{event.description}</p>}
      {(event as any).image_url && (
        <img src={(event as any).image_url} alt="Adjunto" onClick={() => onLightbox((event as any).image_url)}
          style={{ width:'100%', maxHeight:'120px', objectFit:'cover', borderRadius:'8px', marginTop:'8px', border:'1px solid var(--border)', cursor:'zoom-in' }} />
      )}
    </div>
  )
}

/* ─── Shared time grid ─── */
const HOURS = Array.from({ length: END_H - START_H }, (_, i) => START_H + i)

function TimeGrid({ children, noAxisHeader }: { children: React.ReactNode; noAxisHeader?: boolean }) {
  return (
    <div style={{ display:'flex', border:'1px solid var(--border)', borderTop: noAxisHeader ? 'none' : '1px solid var(--border)', borderRadius: noAxisHeader ? '0 0 16px 16px' : '16px', overflow:'hidden', background:'var(--surface)' }}>
      {/* Time axis */}
      <div style={{ width:'52px', flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)' }}>
        {!noAxisHeader && <div style={{ height:'62px', borderBottom:'1px solid var(--border)' }} />}
        {HOURS.map(h => (
          <div key={h} style={{ height:`${ROW_H}px`, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'4px', fontSize:'0.65rem', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', fontWeight:500 }}>
            {pad(h)}:00
          </div>
        ))}
      </div>
      {/* Day columns */}
      <div style={{ flex:1, display:'flex', overflowX:'auto' }}>
        {children}
      </div>
    </div>
  )
}

function DayColumn({ date, events, today, onEventClick, onHeaderClick, onResize, onMove, compact, noHeader, onDoubleClickCell }: {
  date: Date; events: CalendarEvent[]; today: Date
  onEventClick: (ev: CalendarEvent) => void
  onHeaderClick?: () => void
  onResize?: (id: string, start: string, end: string) => void
  onMove?:   (id: string, start: string, end: string) => void
  compact?: boolean
  noHeader?: boolean
  onDoubleClickCell?: (dateStr: string, time: string) => void
}) {
  const isToday = isSameDay(date, today)
  const wknd = isWeekend(date)
  const now = new Date()
  const nowTop = isToday ? (now.getHours() - START_H + now.getMinutes() / 60) * ROW_H : -1
  const [hoverY,      setHoverY]      = useState<number | null>(null)
  const [hoverPlusBtn,setHoverPlusBtn] = useState(false)
  const cellsRef = useRef<HTMLDivElement>(null)

  const SLOT_H = ROW_H / 4 // 15-min slot height
  const snapY  = hoverY !== null ? Math.floor(hoverY / SLOT_H) * SLOT_H : null

  return (
    <div data-date={dateStr(date)} style={{ flex:1, minWidth: compact ? '80px' : '120px', display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)' }}>
      {/* Day header */}
      {!noHeader && (
      <div
        onClick={onHeaderClick}
        style={{ height:'62px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', borderBottom:'1px solid var(--border)', background: wknd ? 'rgba(239,68,68,0.04)' : isToday ? 'rgba(249,115,22,0.06)' : 'var(--surface)', cursor: onHeaderClick ? 'pointer' : 'default', flexShrink:0 }}>
        <span style={{ fontSize:'0.65rem', fontWeight:600, color: wknd ? 'rgba(239,68,68,0.6)' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
          {compact ? DAY_SHORT[(date.getDay() + 6) % 7] : DAY_FULL[(date.getDay() + 6) % 7]}
        </span>
        <span style={{
          fontSize: compact ? '1rem' : '1.2rem', fontWeight:700,
          width:'30px', height:'30px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
          background: isToday ? 'var(--primary)' : 'transparent',
          color: isToday ? 'white' : wknd ? 'rgba(239,68,68,0.75)' : 'var(--foreground)',
          boxShadow: isToday ? '0 0 12px var(--primary-glow)' : 'none',
        }}>
          {date.getDate()}
        </span>
      </div>
      )}
      {/* Time cells */}
      <div
        onMouseMove={onDoubleClickCell ? (e => {
          const rect = e.currentTarget.getBoundingClientRect()
          setHoverY(e.clientY - rect.top)
        }) : undefined}
        onMouseLeave={onDoubleClickCell ? () => setHoverY(null) : undefined}
        ref={cellsRef}
        style={{ flex:1, position:'relative', background: wknd ? 'rgba(239,68,68,0.02)' : 'transparent' }}>
        {/* Hour lines */}
        {HOURS.map(h => (
          <div key={h} style={{ position:'absolute', left:0, right:0, top:`${(h - START_H) * ROW_H}px`, height:`${ROW_H}px`, borderBottom:'1px solid var(--border)', boxSizing:'border-box' }} />
        ))}
        {/* Hover slot highlight */}
        {snapY !== null && (
          <div style={{ position:'absolute', left:0, right:0, top:`${snapY}px`, height:`${SLOT_H}px`, background:'rgba(249,115,22,0.08)', zIndex:1, pointerEvents:'none', display:'flex', alignItems:'center', paddingLeft:'4px', gap:'4px' }}>
            <button
              onMouseEnter={() => setHoverPlusBtn(true)}
              onMouseLeave={() => setHoverPlusBtn(false)}
              onClick={() => onDoubleClickCell!(dateStr(date), pxToTimeStr(snapY!))}
              style={{ pointerEvents:'auto', width:'22px', height:'22px', borderRadius:'50%', background: hoverPlusBtn ? '#fb923c' : 'var(--primary)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', boxShadow: hoverPlusBtn ? '0 0 10px rgba(249,115,22,0.6)' : '0 0 6px var(--primary-glow)', padding:0, transition:'background 0.15s, box-shadow 0.15s, transform 0.1s', transform: hoverPlusBtn ? 'scale(1.15)' : 'scale(1)' }}>
              <span style={{ color:'white', fontSize:'13px', fontWeight:700, lineHeight:1 }}>+</span>
            </button>
            <span style={{ fontSize:'0.65rem', fontWeight:600, color:'var(--primary)' }}>
              {pxToTimeStr(snapY)}
            </span>
          </div>
        )}
        {/* Current time line */}
        {nowTop >= 0 && nowTop <= (END_H - START_H) * ROW_H && (
          <div style={{ position:'absolute', left:0, right:0, top:`${nowTop}px`, zIndex:3, display:'flex', alignItems:'center' }}>
            <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444', flexShrink:0, marginLeft:'-4px' }} />
            <div style={{ flex:1, height:'2px', background:'rgba(239,68,68,0.6)' }} />
          </div>
        )}
        {/* Events */}
        {events.map(ev => <EventBlock key={ev.id} event={ev} onClick={() => onEventClick(ev)} onResize={onResize} onMove={onMove} cellsRef={cellsRef} />)}
      </div>
    </div>
  )
}

function EventBlock({ event, onClick, onResize, onMove: onMoveEvent, cellsRef }: {
  event: CalendarEvent; onClick: () => void
  onResize?:  (id: string, start: string, end: string) => void
  onMove?:    (id: string, start: string, end: string) => void
  cellsRef:   React.RefObject<HTMLDivElement | null>
}) {
  const [liveTop,    setLiveTop]    = useState<number | null>(null)
  const [liveHeight, setLiveHeight] = useState<number | null>(null)
  const [dragMode,   setDragMode]   = useState<'move'|'top'|'bottom'|null>(null)
  const didDrag  = useRef(false)
  const blockRef = useRef<HTMLDivElement>(null)

  const startDt = new Date(event.start)
  const endDt   = event.end ? new Date(event.end) : new Date(startDt.getTime() + 3600000)
  const s = startDt.getHours() + startDt.getMinutes() / 60
  const e = event.end ? (endDt.getHours() + endDt.getMinutes() / 60) : s + 1
  const baseTop    = Math.max(0, (s - START_H) * ROW_H)
  const baseHeight = Math.max((e - s) * ROW_H, ROW_H / 4)
  const top    = liveTop    ?? baseTop
  const height = liveHeight ?? baseHeight
  const color  = event.color || COLORS[0]
  const isDragging = dragMode !== null

  const pxPer15 = ROW_H / 4
  const snap  = (px: number) => Math.round(px / pxPer15) * pxPer15
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const relY  = (clientY: number) => clientY - (cellsRef.current?.getBoundingClientRect().top ?? 0)

  function pxToISO(px: number, date: string): string {
    const totalH = START_H + px / ROW_H
    const h = clamp(Math.floor(totalH), 0, 23)
    const rawM = Math.round((totalH - h) * 60)
    const m = rawM >= 60 ? 0 : rawM
    const [yr, mo, dy] = date.split('-').map(Number)
    return `${yr}-${pad(mo)}-${pad(dy)}T${pad(h)}:${pad(m)}:00`
  }

  function dateAtPoint(x: number, y: number): string | null {
    for (const el of document.elementsFromPoint(x, y) as HTMLElement[]) {
      if (el.dataset?.date) return el.dataset.date
    }
    return null
  }

  /* ── Resize ── */
  function startResize(ev: React.MouseEvent, edge: 'top' | 'bottom') {
    ev.stopPropagation(); ev.preventDefault()
    didDrag.current = false

    const maxPx    = (END_H - START_H) * ROW_H
    const endPosPx = baseTop + baseHeight
    const origDate = dateStr(startDt)

    // Local closures — handleUp captures handleMove directly, removeEventListener always works
    function handleMove(me: MouseEvent) {
      if (!didDrag.current) { didDrag.current = true; setDragMode(edge) }
      if (blockRef.current) blockRef.current.style.pointerEvents = 'none'
      const y = relY(me.clientY)
      if (edge === 'top') {
        const sn = snap(clamp(y, 0, endPosPx - pxPer15))
        setLiveTop(sn); setLiveHeight(endPosPx - sn)
      } else {
        const sn = snap(clamp(y, baseTop + pxPer15, maxPx))
        setLiveHeight(sn - baseTop)
      }
    }
    function handleUp(me: MouseEvent) {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup',   handleUp)
      document.body.style.userSelect = ''
      document.body.style.cursor     = ''
      if (blockRef.current) blockRef.current.style.pointerEvents = ''
      setDragMode(null)
      if (!didDrag.current) { setLiveTop(null); setLiveHeight(null); return }
      const y = relY(me.clientY)
      if (edge === 'top') {
        const sn = snap(clamp(y, 0, endPosPx - pxPer15))
        setLiveTop(null); setLiveHeight(null)
        onResize?.(event.id, pxToISO(sn, origDate), event.end ?? pxToISO(endPosPx, origDate))
      } else {
        const sn = snap(clamp(y, baseTop + pxPer15, maxPx))
        setLiveHeight(null)
        onResize?.(event.id, event.start, pxToISO(sn, origDate))
      }
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = edge === 'top' ? 'n-resize' : 's-resize'
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup',   handleUp)
  }

  /* ── Move ── */
  function startMove(ev: React.MouseEvent) {
    ev.stopPropagation(); ev.preventDefault()
    didDrag.current = false

    const grabOffset = relY(ev.clientY) - baseTop
    const maxTopPx   = (END_H - START_H) * ROW_H - baseHeight
    const targetDate = { current: dateStr(startDt) }

    function handleMove(me: MouseEvent) {
      if (!didDrag.current) { didDrag.current = true; setDragMode('move') }
      if (blockRef.current) blockRef.current.style.pointerEvents = 'none'
      const sn = snap(clamp(relY(me.clientY) - grabOffset, 0, maxTopPx))
      setLiveTop(sn); setLiveHeight(baseHeight)
      const nd = dateAtPoint(me.clientX, me.clientY)
      if (nd) targetDate.current = nd
    }
    function handleUp(me: MouseEvent) {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup',   handleUp)
      document.body.style.userSelect = ''
      document.body.style.cursor     = ''
      if (blockRef.current) blockRef.current.style.pointerEvents = ''
      setDragMode(null)
      if (!didDrag.current) { setLiveTop(null); setLiveHeight(null); return }
      const sn   = snap(clamp(relY(me.clientY) - grabOffset, 0, maxTopPx))
      const date = targetDate.current
      setLiveTop(null); setLiveHeight(null)
      onMoveEvent?.(event.id, pxToISO(sn, date), pxToISO(sn + baseHeight, date))
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup',   handleUp)
  }

  const HANDLE_H = 10 // px — resize handle height
  const dispStart = pxToTimeStr(top)
  const dispEnd   = pxToTimeStr(top + height)

  return (
    <div
      ref={blockRef}
      onClick={() => { if (!didDrag.current) onClick() }}
      style={{
        position:'absolute', left:'3px', right:'3px',
        top:`${top}px`, height:`${height}px`,
        zIndex: isDragging ? 30 : 2, userSelect:'none',
        transition: isDragging ? 'none' : 'top 0.06s, height 0.06s',
      }}
    >
      {/* Event body — padded so it never covers the resize handles */}
      <div
        onMouseDown={onMoveEvent ? startMove : undefined}
        style={{
          position:'absolute',
          top: onResize ? `${HANDLE_H}px` : 0,
          bottom: onResize ? `${HANDLE_H}px` : 0,
          left:0, right:0,
          borderRadius:'8px',
          background: color,
          padding:'3px 8px', overflow:'hidden',
          boxShadow: isDragging
            ? `0 8px 24px ${color}66, 0 2px 8px rgba(0,0,0,0.18)`
            : `0 1px 4px ${color}44`,
          cursor: dragMode === 'move' ? 'grabbing' : (onMoveEvent ? 'grab' : 'pointer'),
          display:'flex', flexDirection:'column', justifyContent:'flex-start',
          opacity: isDragging ? 0.93 : 1,
          transform: dragMode === 'move' ? 'scale(1.02)' : 'scale(1)',
          transition: isDragging ? 'none' : 'box-shadow 0.15s, transform 0.1s',
        }}
      >
        <p style={{ fontSize:'0.72rem', fontWeight:700, color:'white', margin:0, lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {event.title}
        </p>
        {(height - HANDLE_H * 2) > 16 && (
          <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.92)', margin:'1px 0 0', fontWeight: isDragging ? 700 : 400, whiteSpace:'nowrap' }}>
            {isDragging ? `${dispStart} – ${dispEnd}` : (event.end ? `${fmtTime(event.start)} – ${fmtTime(event.end)}` : fmtTime(event.start))}
          </p>
        )}
      </div>

      {/* Top resize handle — sits above the body, never overlaps */}
      {onResize && (
        <div
          onMouseDown={e => startResize(e, 'top')}
          style={{ position:'absolute', top:0, left:0, right:0, height:`${HANDLE_H}px`, cursor:'n-resize', zIndex:6, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <div style={{ width:'36px', height:'4px', borderRadius:'2px', background:'rgba(255,255,255,0.9)' }} />
        </div>
      )}

      {/* Bottom resize handle */}
      {onResize && (
        <div
          onMouseDown={e => startResize(e, 'bottom')}
          style={{ position:'absolute', bottom:0, left:0, right:0, height:`${HANDLE_H}px`, cursor:'s-resize', zIndex:6, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <div style={{ width:'36px', height:'4px', borderRadius:'2px', background:'rgba(255,255,255,0.9)' }} />
        </div>
      )}
    </div>
  )
}

/* ─── Week view ─── */
function WeekView({ events, today, days, onEventClick, onDayClick, onResize, onMove, onDoubleClickCell }: {
  events: CalendarEvent[]; today: Date; days: Date[]
  onEventClick: (ev: CalendarEvent) => void; onDayClick: (d: Date) => void
  onResize: (id: string, start: string, end: string) => void
  onMove:   (id: string, start: string, end: string) => void
  onDoubleClickCell?: (date: string, time: string) => void
}) {
  return (
    <>
      {/* Sticky day header row */}
      <div style={{ position:'sticky', top:0, zIndex:10, display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderBottom:'none', borderRadius:'16px 16px 0 0', flexShrink:0 }}>
        <div style={{ width:'52px', flexShrink:0, borderRight:'1px solid var(--border)' }} />
        <div style={{ flex:1, display:'flex', overflowX:'hidden' }}>
          {days.map(d => {
            const isToday = isSameDay(d, today)
            const wknd    = isWeekend(d)
            return (
              <div key={dateStr(d)} onClick={() => onDayClick(d)}
                style={{ flex:1, minWidth:'80px', height:'62px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', borderRight:'1px solid var(--border)', cursor:'pointer', background: wknd ? 'rgba(239,68,68,0.04)' : isToday ? 'rgba(249,115,22,0.06)' : 'var(--surface)' }}>
                <span style={{ fontSize:'0.65rem', fontWeight:600, color: wknd ? 'rgba(239,68,68,0.6)' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  {DAY_SHORT[(d.getDay() + 6) % 7]}
                </span>
                <span style={{ fontSize:'1rem', fontWeight:700, width:'30px', height:'30px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background: isToday ? 'var(--primary)' : 'transparent', color: isToday ? 'white' : wknd ? 'rgba(239,68,68,0.75)' : 'var(--foreground)', boxShadow: isToday ? '0 0 12px var(--primary-glow)' : 'none' }}>
                  {d.getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {/* Scrollable time grid (no headers) */}
      <TimeGrid noAxisHeader>
        {days.map(d => (
          <DayColumn key={dateStr(d)} date={d} today={today}
            events={events.filter(e => e.start.startsWith(dateStr(d)))}
            onEventClick={onEventClick}
            onHeaderClick={() => onDayClick(d)}
            onResize={onResize}
            onMove={onMove}
            compact
            noHeader
            onDoubleClickCell={onDoubleClickCell}
          />
        ))}
      </TimeGrid>
    </>
  )
}

/* ─── Day view ─── */
function DayView({ events, today, date, onEventClick, onResize, onMove, onDoubleClickCell }: {
  events: CalendarEvent[]; today: Date; date: Date
  onEventClick: (ev: CalendarEvent) => void
  onResize: (id: string, start: string, end: string) => void
  onMove:   (id: string, start: string, end: string) => void
  onDoubleClickCell?: (date: string, time: string) => void
}) {
  const isToday = isSameDay(date, today)
  const wknd    = isWeekend(date)
  return (
    <>
      {/* Sticky day header row */}
      <div style={{ position:'sticky', top:0, zIndex:10, display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderBottom:'none', borderRadius:'16px 16px 0 0', flexShrink:0 }}>
        <div style={{ width:'52px', flexShrink:0, borderRight:'1px solid var(--border)' }} />
        <div style={{ flex:1, height:'62px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', background: wknd ? 'rgba(239,68,68,0.04)' : isToday ? 'rgba(249,115,22,0.06)' : 'var(--surface)' }}>
          <span style={{ fontSize:'0.65rem', fontWeight:600, color: wknd ? 'rgba(239,68,68,0.6)' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
            {DAY_FULL[(date.getDay() + 6) % 7]}
          </span>
          <span style={{ fontSize:'1.2rem', fontWeight:700, width:'30px', height:'30px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background: isToday ? 'var(--primary)' : 'transparent', color: isToday ? 'white' : wknd ? 'rgba(239,68,68,0.75)' : 'var(--foreground)', boxShadow: isToday ? '0 0 12px var(--primary-glow)' : 'none' }}>
            {date.getDate()}
          </span>
        </div>
      </div>
      <TimeGrid noAxisHeader>
        <DayColumn date={date} today={today} events={events} onEventClick={onEventClick} onResize={onResize} onMove={onMove} noHeader onDoubleClickCell={onDoubleClickCell} />
      </TimeGrid>
    </>
  )
}

/* ─── TimePicker ─── */
function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref     = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const slots = useMemo(() => {
    const list: string[] = []
    for (let h = 0; h < 24; h++)
      for (let m = 0; m < 60; m += 15)
        list.push(`${pad(h)}:${pad(m)}`)
    return list
  }, [])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    if (open && value && listRef.current) {
      const idx = slots.indexOf(value)
      if (idx >= 0) listRef.current.scrollTop = Math.max(0, idx * 34 - 68)
    }
  }, [open, value, slots])

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width:'100%', display:'flex', alignItems:'center', gap:'6px',
        padding:'10px 14px', borderRadius:'10px',
        background:'var(--background)', border:`1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
        color: value ? 'var(--foreground)' : 'var(--text-muted)',
        cursor:'pointer', fontSize:'0.875rem', transition:'border-color 0.15s',
      }}>
        <Clock size={13} style={{ color:'var(--text-muted)', flexShrink:0 }} />
        <span style={{ flex:1, textAlign:'left', fontWeight: value ? 500 : 400 }}>{value || (label ?? '--:--')}</span>
      </button>
      {open && (
        <div ref={listRef} style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:200,
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:'12px', boxShadow:'0 8px 28px rgba(0,0,0,0.13)',
          maxHeight:'210px', overflowY:'auto', minWidth:'120px', padding:'4px',
        }}>
          {slots.map(slot => (
            <button type="button" key={slot} onClick={() => { onChange(slot); setOpen(false) }} style={{
              display:'block', width:'100%', padding:'6px 12px',
              textAlign:'left', borderRadius:'7px', border:'none',
              cursor:'pointer', fontSize:'0.82rem',
              background: slot === value ? 'var(--primary)' : 'transparent',
              color: slot === value ? 'white' : 'var(--foreground)',
              fontWeight: slot === value ? 600 : 400,
            }}>
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── DropZone ─── */
interface DropZoneProps { imageUrl: string | null; uploading: boolean; dragOver: boolean; onFile: (f: File) => void; onDragOver: () => void; onDragLeave: () => void; onRemove: () => void }
function DropZone({ imageUrl, uploading, dragOver, onFile, onDragOver, onDragLeave, onRemove }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  function handleDrop(e: React.DragEvent) { e.preventDefault(); onDragLeave(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }
  return (
    <div>
      {imageUrl ? (
        <div style={{ position:'relative', display:'inline-block' }}>
          <img src={imageUrl} alt="Adjunto" style={{ maxHeight:'100px', borderRadius:'8px', border:'1px solid var(--border)', display:'block' }} />
          <button type="button" onClick={onRemove} style={{ position:'absolute', top:'-6px', right:'-6px', width:'20px', height:'20px', borderRadius:'50%', background:'#ef4444', border:'none', color:'white', cursor:'pointer', fontSize:'0.7rem', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); onDragOver() }} onDragLeave={onDragLeave} onDrop={handleDrop} onClick={() => inputRef.current?.click()}
          style={{ border:`1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`, borderRadius:'9px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', background: dragOver ? 'rgba(249,115,22,0.05)' : 'transparent', transition:'all 0.15s', color:'var(--text-muted)', fontSize:'0.8rem' }}>
          <Paperclip size={14} />
          {uploading ? 'Subiendo...' : 'Adjuntar imagen · arrastra aquí'}
          <input ref={inputRef} type="file" accept="image/*,.pdf,.doc,.docx" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        </div>
      )}
    </div>
  )
}

function CalIcon({ size, style }: { size: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={style}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
}

