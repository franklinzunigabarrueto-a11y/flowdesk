'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react'
import { CalendarEvent } from '@/types'
import { formatDate } from '@/lib/utils'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const EVENT_COLORS = ['#7c5cfc', '#00e5cc', '#f59e0b', '#22c55e', '#ef4444', '#3b82f6']

export default function CalendarView() {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today.getDate())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Calendario</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            Gestiona tus eventos y agenda
          </p>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 18px', borderRadius: '10px',
          background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
          border: 'none', color: 'white', cursor: 'pointer',
          fontSize: '0.875rem', fontWeight: 500
        }}>
          <Plus size={16} /> Nuevo evento
        </button>
      </div>

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
                      ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))'
                      : isSelected ? 'rgba(124,92,252,0.1)' : 'transparent',
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
                  <Calendar size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
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
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '4px' }}>
                      {event.title}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      <Clock size={12} />
                      {new Date(event.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {event.end && ` → ${new Date(event.end).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                    {event.description && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {event.description}
                      </p>
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

function Calendar({ size, style }: { size: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={style}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
}
