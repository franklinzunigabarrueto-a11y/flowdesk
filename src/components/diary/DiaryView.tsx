'use client'

import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())
import { BookOpen, Mic, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { DiaryEntry } from '@/types'
import { formatDate, isToday } from '@/lib/utils'

export default function DiaryView() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')

  const swrKey = `/api/diary?date=${selectedDate}${committedQuery ? `&q=${encodeURIComponent(committedQuery)}` : ''}`
  const { data, mutate } = useSWR(swrKey, fetcher)
  const entries: DiaryEntry[] = data?.entries ?? []
  const loading = !data

  function changeDay(delta: number) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const displayDate = new Date(selectedDate + 'T12:00:00')
  const isSelectedToday = isToday(displayDate)

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bitácora de obra</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
          Tu registro diario desde WhatsApp
        </p>
      </div>

      {/* Nav fecha + búsqueda */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '4px'
        }}>
          <button onClick={() => changeDay(-1)} style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{
            fontSize: '0.875rem', fontWeight: 600, minWidth: '140px', textAlign: 'center',
            color: isSelectedToday ? 'var(--primary)' : 'var(--foreground)'
          }}>
            {isSelectedToday ? '📅 Hoy' : formatDate(selectedDate)}
          </span>
          <button
            onClick={() => changeDay(1)}
            disabled={isSelectedToday}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'transparent', border: 'none',
              color: isSelectedToday ? 'var(--border)' : 'var(--text-muted)',
              cursor: isSelectedToday ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <input
          type="date"
          value={selectedDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={e => setSelectedDate(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '10px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none'
          }}
        />

        <div style={{ flex: 1, position: 'relative', minWidth: '180px' }}>
          <Search size={16} style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)'
          }} />
          <input
            type="text"
            placeholder="Buscar en la bitácora..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setCommittedQuery('') }}
            onKeyDown={e => { if (e.key === 'Enter') setCommittedQuery(searchQuery) }}
            style={{
              width: '100%', padding: '8px 12px 8px 38px',
              borderRadius: '10px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Entradas */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Cargando entradas...
        </div>
      ) : entries.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '20px', color: 'var(--text-muted)'
        }}>
          <BookOpen size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>
            Sin entradas para {isSelectedToday ? 'hoy' : 'esta fecha'}
          </p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', lineHeight: 1.6 }}>
            Envía un mensaje de texto o audio a tu bot de WhatsApp<br/>
            y aparecerá aquí automáticamente.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {entries.map((entry, i) => (
            <div key={entry.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${entry.audio_url ? '#ef4444' : 'var(--primary)'}`,
              borderRadius: '16px', overflow: 'hidden',
              animation: 'fadeIn 0.3s ease',
              animationDelay: `${i * 0.05}s`,
              animationFillMode: 'backwards'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-hover)'
              }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: entry.audio_url ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)',
                  border: `1px solid ${entry.audio_url ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {entry.audio_url
                    ? <Mic size={14} color="#ef4444" />
                    : <BookOpen size={14} color="var(--primary)" />
                  }
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {entry.audio_url ? 'Audio transcrito' : 'Mensaje de texto'} ·{' '}
                  {new Date(entry.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {entry.task_references && entry.task_references.length > 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.72rem', color: 'var(--primary)',
                    background: 'rgba(249,115,22,0.1)', padding: '2px 8px', borderRadius: '100px'
                  }}>
                    {entry.task_references.length} tarea{entry.task_references.length > 1 ? 's' : ''} mencionada{entry.task_references.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div style={{ padding: '1rem 1.25rem' }}>
                <p style={{
                  fontSize: '0.9rem', lineHeight: 1.7,
                  color: 'var(--foreground)',
                  whiteSpace: 'pre-wrap'
                }}>
                  {entry.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
