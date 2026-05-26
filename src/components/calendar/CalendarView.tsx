'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Plus, Clock, Trash2, X, Pencil, Check, Paperclip } from 'lucide-react'
import { CalendarEvent } from '@/types'
import DatePicker from '@/components/ui/DatePicker'

const fetcher = (url: string) => fetch(url).then(r => r.json())

/* ─── Constants ─── */
const DAY_SHORT  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAY_FULL   = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS     = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const COLORS     = ['#f97316','#3b82f6','#22c55e','#ef4444','#8b5cf6','#f59e0b']
const START_H    = 6
const END_H      = 22
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

/* ─── Main component ─── */
export default function CalendarView() {
  const today = new Date()

  const [view,        setView]        = useState<View>('month')
  const [curDate,     setCurDate]     = useState(today)
  const [selDay,      setSelDay]      = useState(today.getDate())
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [popupEvent,  setPopupEvent]  = useState<CalendarEvent | null>(null)
  const [popupEditing,setPopupEditing]= useState(false)

  const [newEv, setNewEv] = useState({ title: '', date: '', time: '', duration: 60, description: '' })
  const [createImg, setCreateImg] = useState<string | null>(null)
  const [createUpl, setCreateUpl] = useState(false)
  const [createDrag,setCreateDrag]= useState(false)

  const [editDraft, setEditDraft] = useState({ title: '', date: '', time: '', duration: 60, description: '' })
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
      const end_time   = endTime(newEv.date, newEv.time, newEv.duration)
      await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newEv.title, description: newEv.description, start_time, end_time, image_url: createImg }),
      })
      setNewEv({ title: '', date: '', time: '', duration: 60, description: '' })
      setCreateImg(null); setShowForm(false); mutate()
    } finally { setSaving(false) }
  }

  async function deleteEvent(id: string) {
    setDeletingId(id)
    try { await fetch(`/api/events/${id}`, { method: 'DELETE' }); mutate() }
    finally { setDeletingId(null) }
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
    let duration = 60
    if (event.end) duration = Math.max(15, Math.round((new Date(event.end).getTime() - d.getTime()) / 60000))
    setEditDraft({ title: event.title, date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, duration, description: event.description || '' })
    setEditImg((event as any).image_url || null)
    setPopupEditing(true)
  }

  async function saveEditPopup() {
    if (!popupEvent || !editDraft.title.trim() || !editDraft.date || !editDraft.time) return
    setEditSaving(true)
    try {
      const start_time = `${editDraft.date}T${editDraft.time}:00`
      const end_time   = endTime(editDraft.date, editDraft.time, editDraft.duration)
      await fetch(`/api/events/${popupEvent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editDraft.title, start_time, end_time, description: editDraft.description, image_url: editImg }),
      })
      setPopupEvent(null); setPopupEditing(false); mutate()
    } finally { setEditSaving(false) }
  }

  function eventsForDay(d: Date) { return events.filter(e => e.start.startsWith(dateStr(d))) }

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
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>

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
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    <DatePicker value={editDraft.date} onChange={d => setEditDraft(p => ({ ...p, date: d }))} />
                    <input type="time" value={editDraft.time} onChange={e => setEditDraft(p => ({ ...p, time: e.target.value }))}
                      style={{ padding:'8px 12px', borderRadius:'9px', border:'1px solid var(--border)', background:'var(--background)', color:'var(--foreground)', fontSize:'0.85rem', outline:'none' }} />
                  </div>
                  <select value={editDraft.duration} onChange={e => setEditDraft(p => ({ ...p, duration: Number(e.target.value) }))}
                    style={{ padding:'8px 12px', borderRadius:'9px', border:'1px solid var(--border)', background:'var(--background)', color:'var(--foreground)', fontSize:'0.85rem', outline:'none' }}>
                    {DURATIONS.map(d => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
                  </select>
                  {editDraft.date && editDraft.time && (
                    <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0 }}>
                      🕐 {editDraft.time} → {calcEndPreview(editDraft.date, editDraft.time, editDraft.duration)} · {DURATIONS.find(d => d.minutes === editDraft.duration)?.label}
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

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
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
        <form onSubmit={createEvent} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'16px', padding:'1.5rem', marginBottom:'1.5rem', animation:'fadeIn 0.3s ease' }}>
          <div style={{ display:'grid', gap:'1rem' }}>
            <input type="text" placeholder="Título del evento..." value={newEv.title} required onChange={e => setNewEv(p => ({ ...p, title: e.target.value }))}
              style={{ padding:'10px 14px', borderRadius:'10px', background:'var(--background)', border:'1px solid var(--border)', color:'var(--foreground)', fontSize:'0.95rem', outline:'none' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1rem' }}>
              <DatePicker value={newEv.date} onChange={d => setNewEv(p => ({ ...p, date: d }))} />
              <input type="time" value={newEv.time} required onChange={e => setNewEv(p => ({ ...p, time: e.target.value }))}
                style={{ padding:'10px 14px', borderRadius:'10px', background:'var(--background)', border:'1px solid var(--border)', color:'var(--foreground)', fontSize:'0.875rem', outline:'none' }} />
              <select value={newEv.duration} onChange={e => setNewEv(p => ({ ...p, duration: Number(e.target.value) }))}
                style={{ padding:'10px 14px', borderRadius:'10px', background:'var(--background)', border:'1px solid var(--border)', color:'var(--foreground)', fontSize:'0.875rem', outline:'none' }}>
                {DURATIONS.map(d => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
              </select>
            </div>
            {newEv.date && newEv.time && (
              <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:0 }}>
                🕐 <strong>{newEv.time}</strong> → <strong>{calcEndPreview(newEv.date, newEv.time, newEv.duration)}</strong> · {DURATIONS.find(d => d.minutes === newEv.duration)?.label}
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

      {/* Nav bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem', position:'relative' }}>
        {/* ← título → agrupados en el centro */}
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <button onClick={goBack} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize:'0.95rem', fontWeight:600, minWidth:'220px', textAlign:'center' }}>{navTitle()}</span>
          <button onClick={goForward} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--foreground)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>
        {/* Hoy — esquina derecha */}
        <button onClick={goToday} style={{ position:'absolute', right:0, padding:'6px 14px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.8rem', fontWeight:500 }}>
          Hoy
        </button>
      </div>

      {/* ── Month view ── */}
      {view === 'month' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'1.5rem' }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'20px', overflow:'hidden' }}>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'1rem 1.5rem 0.5rem' }}>
              {DAY_SHORT.map((d, idx) => (
                <div key={d} style={{ textAlign:'center', fontSize:'0.75rem', fontWeight:600, padding:'0.5rem 0', color: isWkendCol(idx) ? 'rgba(239,68,68,0.55)' : 'var(--text-muted)', background: isWkendCol(idx) ? 'rgba(239,68,68,0.05)' : 'transparent' }}>{d}</div>
              ))}
            </div>
            {/* Grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'0 1.5rem 1.5rem', gap:0 }}>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} style={{ aspectRatio:'1', background: isWkendCol(i) ? 'rgba(239,68,68,0.05)' : 'transparent' }} />
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
                    <button onClick={() => setSelDay(day)} style={{
                      width:'100%', aspectRatio:'1', borderRadius:'10px',
                      border: isSel && !isToday ? '1px solid var(--primary)' : '1px solid transparent',
                      background: isToday ? 'var(--primary)' : isSel ? 'rgba(249,115,22,0.12)' : 'transparent',
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

          {/* Events panel */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'20px', overflow:'hidden' }}>
            <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border)' }}>
              <h3 style={{ fontSize:'0.95rem', fontWeight:600, margin:0 }}>
                {isSameDay(selDate, today) ? 'Hoy' : `${selDay} de ${MONTHS[month]}`}
              </h3>
              <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:'4px 0 0' }}>{selEvents.length} evento{selEvents.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ padding:'1rem' }}>
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
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Week view ── */}
      {view === 'week' && (
        <WeekView events={events} today={today} days={weekDays(curDate)}
          onEventClick={ev => { setPopupEvent(ev); setPopupEditing(false) }}
          onDayClick={d => { setCurDate(d); setView('day') }}
        />
      )}

      {/* ── Day view ── */}
      {view === 'day' && (
        <DayView events={eventsForDay(curDate)} today={today} date={curDate}
          onEventClick={ev => { setPopupEvent(ev); setPopupEditing(false) }}
        />
      )}
    </div>
  )
}

/* ─── Month event card (sidebar) ─── */
function MonthEventCard({ event, index, deletingId, onEdit, onDelete, onLightbox }: {
  event: CalendarEvent; index: number; deletingId: string | null
  onEdit: () => void; onDelete: (id: string) => void; onLightbox: (url: string) => void
}) {
  const color = event.color || COLORS[index % COLORS.length]
  return (
    <div style={{ padding:'0.875rem', borderRadius:'12px', background:'var(--surface-hover)', border:`1px solid ${color}30`, marginBottom:'8px', borderLeft:`3px solid ${color}` }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
        <p style={{ fontSize:'0.875rem', fontWeight:600, marginBottom:'4px', flex:1 }}>{event.title}</p>
        <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
          <button onClick={onEdit} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'2px', borderRadius:'6px' }}><Pencil size={13} /></button>
          <button onClick={() => onDelete(event.id)} disabled={deletingId === event.id} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'2px', borderRadius:'6px', opacity: deletingId === event.id ? 0.4 : 1 }}><Trash2 size={14} /></button>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--text-muted)', fontSize:'0.78rem' }}>
        <Clock size={12} />
        {fmtTime(event.start)}
        {event.end && ` → ${fmtTime(event.end)}`}
        {event.end && <span style={{ marginLeft:'4px', fontSize:'0.7rem', color, fontWeight:600 }}>{durationLabel(event)}</span>}
      </div>
      {event.description && <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'6px' }}>{event.description}</p>}
      {(event as any).image_url && (
        <img src={(event as any).image_url} alt="Adjunto" onClick={() => onLightbox((event as any).image_url)}
          style={{ width:'100%', maxHeight:'120px', objectFit:'cover', borderRadius:'8px', marginTop:'8px', border:'1px solid var(--border)', cursor:'zoom-in' }} />
      )}
    </div>
  )
}

/* ─── Shared time grid ─── */
const HOURS = Array.from({ length: END_H - START_H }, (_, i) => START_H + i)

function TimeGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:'16px', overflow:'hidden', background:'var(--surface)' }}>
      {/* Time axis */}
      <div style={{ width:'52px', flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)' }}>
        <div style={{ height:'48px', borderBottom:'1px solid var(--border)' }} /> {/* header spacer */}
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

function DayColumn({ date, events, today, onEventClick, onHeaderClick, compact }: {
  date: Date; events: CalendarEvent[]; today: Date
  onEventClick: (ev: CalendarEvent) => void
  onHeaderClick?: () => void
  compact?: boolean
}) {
  const isToday = isSameDay(date, today)
  const wknd = isWeekend(date)
  const now = new Date()
  const nowTop = isToday ? (now.getHours() - START_H + now.getMinutes() / 60) * ROW_H : -1

  return (
    <div style={{ flex:1, minWidth: compact ? '80px' : '120px', display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)' }}>
      {/* Day header */}
      <div
        onClick={onHeaderClick}
        style={{ height:'48px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', borderBottom:'1px solid var(--border)', background: wknd ? 'rgba(239,68,68,0.04)' : isToday ? 'rgba(249,115,22,0.06)' : 'var(--surface)', cursor: onHeaderClick ? 'pointer' : 'default', flexShrink:0 }}>
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
      {/* Time cells */}
      <div style={{ flex:1, position:'relative', background: wknd ? 'rgba(239,68,68,0.02)' : 'transparent' }}>
        {/* Hour lines */}
        {HOURS.map(h => (
          <div key={h} style={{ position:'absolute', left:0, right:0, top:`${(h - START_H) * ROW_H}px`, height:`${ROW_H}px`, borderBottom:'1px solid var(--border)', boxSizing:'border-box' }} />
        ))}
        {/* Current time line */}
        {nowTop >= 0 && nowTop <= (END_H - START_H) * ROW_H && (
          <div style={{ position:'absolute', left:0, right:0, top:`${nowTop}px`, zIndex:3, display:'flex', alignItems:'center' }}>
            <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444', flexShrink:0, marginLeft:'-4px' }} />
            <div style={{ flex:1, height:'2px', background:'rgba(239,68,68,0.6)' }} />
          </div>
        )}
        {/* Events */}
        {events.map(ev => <EventBlock key={ev.id} event={ev} onClick={() => onEventClick(ev)} />)}
      </div>
    </div>
  )
}

function EventBlock({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const start  = new Date(event.start)
  const endDt  = event.end ? new Date(event.end) : new Date(start.getTime() + 3600000)
  const s = Math.max(start.getHours() + start.getMinutes() / 60, START_H)
  const e = Math.min(endDt.getHours()  + endDt.getMinutes()  / 60, END_H)
  const top    = (s - START_H) * ROW_H
  const height = Math.max((e - s) * ROW_H, 18)
  const color  = event.color || COLORS[0]

  return (
    <div onClick={onClick} style={{
      position:'absolute', left:'3px', right:'3px', top:`${top}px`, height:`${height}px`,
      borderRadius:'7px', background: color, padding:'3px 6px',
      cursor:'pointer', overflow:'hidden', zIndex:2,
      boxShadow:`0 1px 6px ${color}55`,
      transition:'filter 0.15s',
    }}>
      <p style={{ fontSize:'0.72rem', fontWeight:700, color:'white', margin:0, lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{event.title}</p>
      {height > 34 && <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.85)', margin:'2px 0 0' }}>{fmtTime(event.start)}{event.end ? ` – ${fmtTime(event.end)}` : ''}</p>}
    </div>
  )
}

/* ─── Week view ─── */
function WeekView({ events, today, days, onEventClick, onDayClick }: {
  events: CalendarEvent[]; today: Date; days: Date[]
  onEventClick: (ev: CalendarEvent) => void; onDayClick: (d: Date) => void
}) {
  return (
    <TimeGrid>
      {days.map(d => (
        <DayColumn key={dateStr(d)} date={d} today={today}
          events={events.filter(e => e.start.startsWith(dateStr(d)))}
          onEventClick={onEventClick}
          onHeaderClick={() => onDayClick(d)}
          compact
        />
      ))}
    </TimeGrid>
  )
}

/* ─── Day view ─── */
function DayView({ events, today, date, onEventClick }: {
  events: CalendarEvent[]; today: Date; date: Date
  onEventClick: (ev: CalendarEvent) => void
}) {
  return (
    <TimeGrid>
      <DayColumn date={date} today={today} events={events} onEventClick={onEventClick} />
    </TimeGrid>
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

