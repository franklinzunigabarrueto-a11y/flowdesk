'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  BookOpen, Mic, Search, ChevronLeft, ChevronRight,
  ImageIcon, Sparkles, CalendarCheck, Mail, AlertTriangle,
  ShieldAlert, Loader2, Clock, Calendar, CheckSquare, ChevronDown,
} from 'lucide-react'
import { ActivityItem } from '@/types'
import { DiarySuggestion } from '@/lib/gemini'
import { formatDate, isToday } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const SUGGESTION_META: Record<DiarySuggestion['type'], {
  Icon: React.ElementType; color: string; bg: string; border: string; label: string
}> = {
  followup: { Icon: CalendarCheck, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', label: 'Seguimiento' },
  backup:   { Icon: Mail,          color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', label: 'Respaldo' },
  alert:    { Icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: 'Alerta' },
  risk:     { Icon: ShieldAlert,   color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  label: 'Riesgo' },
}

const PRIORITY_DOT: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#22c55e',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'Alta', medium: 'Media', low: 'Baja',
}

export default function DiaryView() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [searchQuery, setSearchQuery] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')

  const swrKey = `/api/diary?date=${selectedDate}${committedQuery ? `&q=${encodeURIComponent(committedQuery)}` : ''}`
  const { data } = useSWR(swrKey, fetcher)
  const activities: ActivityItem[] = data?.activities ?? []
  const loading = !data

  const summaryKey = data && activities.length > 0 && !committedQuery
    ? `/api/diary/summary?date=${selectedDate}`
    : null
  const { data: summaryData, isLoading: summaryLoading } = useSWR(summaryKey, fetcher, {
    revalidateOnFocus: false,
  })
  const summary: string | null  = summaryData?.summary ?? null
  const suggestions: DiarySuggestion[] = summaryData?.suggestions ?? []
  const aiError: boolean  = summaryData?.aiError  ?? false
  const pending: boolean  = summaryData?.pending  ?? false

  function changeDay(delta: number) {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    date.setDate(date.getDate() + delta)
    setSelectedDate(date.toLocaleDateString('en-CA'))
  }

  const isSelectedToday = isToday(new Date(selectedDate + 'T12:00:00'))

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bitácora de obra</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
          Historial de toda tu actividad diaria
        </p>
      </div>

      {/* Controles */}
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
          max={new Date().toLocaleDateString('en-CA')}
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
              width: '100%', padding: '8px 12px 8px 38px', borderRadius: '10px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Layout principal: 2 columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── COLUMNA IZQUIERDA: Actividad del día ── */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '1rem', paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border)'
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Actividad del día
            </span>
            {!loading && activities.length > 0 && (
              <span style={{
                fontSize: '0.72rem', color: 'var(--primary)',
                background: 'rgba(249,115,22,0.1)', padding: '2px 8px', borderRadius: '100px', fontWeight: 600
              }}>
                {activities.length} registro{activities.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <HistorialSkeleton />
          ) : activities.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '4rem 2rem',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '20px', color: 'var(--text-muted)'
            }}>
              <BookOpen size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                Sin actividad para {isSelectedToday ? 'hoy' : 'esta fecha'}
              </p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', lineHeight: 1.6 }}>
                Envía mensajes al bot de WhatsApp o crea eventos y tareas desde la app<br />
                y aparecerán aquí automáticamente.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {activities.map((item, i) => (
                <ActivityCard key={item.id} item={item} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* ── COLUMNA DERECHA: Resumen + Sugerencias ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Resumen del día */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '16px', overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)',
              background: 'var(--surface-hover)'
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Sparkles size={14} color="var(--primary)" />
              </div>
              <div>
                <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>Resumen del día</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>Generado con IA · 18:00 h</p>
              </div>
            </div>

            <div style={{ padding: '1rem 1.25rem', minHeight: '80px' }}>
              {!summaryKey ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {loading ? 'Cargando actividad...' : 'Sin actividad registrada para generar resumen.'}
                </p>
              ) : summaryLoading ? (
                <SummaryLoadingState />
              ) : pending ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Clock size={15} color="var(--text-muted)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
                    El resumen diario se genera automáticamente a las <strong style={{ color: 'var(--foreground)' }}>18:00 h (hora Chile)</strong>.<br />
                    Vuelve esta tarde para ver el análisis de tu jornada.
                  </p>
                </div>
              ) : aiError ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  IA temporalmente no disponible. Verifica tu conexión.
                </p>
              ) : summary ? (
                <p style={{ fontSize: '0.875rem', lineHeight: 1.75, color: 'var(--foreground)' }}>
                  {summary}
                </p>
              ) : null}
            </div>
          </div>

          {/* Sugerencias */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '16px', overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)',
              background: 'var(--surface-hover)'
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <CalendarCheck size={14} color="#3b82f6" />
              </div>
              <div>
                <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>Sugerencias de obra</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>Basadas en tu actividad</p>
              </div>
            </div>

            <div style={{ padding: '0.875rem' }}>
              {!summaryKey ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, padding: '0 0.375rem' }}>
                  {loading ? '' : 'Sin actividad registrada.'}
                </p>
              ) : summaryLoading ? (
                <SuggestionsLoadingState />
              ) : pending ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, padding: '0.25rem 0.375rem' }}>
                  Las sugerencias se habilitarán junto con el resumen a las 18:00 h.
                </p>
              ) : suggestions.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, padding: '0.25rem 0.375rem' }}>
                  Sin sugerencias específicas para este día.
                </p>
              ) : (
                <SuggestionList suggestions={suggestions} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Activity card — handles all source types ─── */
function ActivityCard({ item, index }: { item: ActivityItem; index: number }) {
  const cfg = {
    whatsapp_text:  { Icon: BookOpen,     color: 'var(--primary)', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.2)', accent: 'var(--primary)', label: 'Mensaje de texto' },
    whatsapp_audio: { Icon: Mic,          color: '#ef4444',        bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  accent: '#ef4444',        label: 'Audio transcrito' },
    whatsapp_photo: { Icon: ImageIcon,    color: '#22c55e',        bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)',  accent: '#22c55e',        label: 'Foto de obra' },
    event:          { Icon: Calendar,     color: '#3b82f6',        bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', accent: '#3b82f6',        label: 'Evento creado' },
    task:           { Icon: CheckSquare,  color: '#8b5cf6',        bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', accent: '#8b5cf6',        label: 'Tarea creada' },
  }[item.source]

  const time = new Date(item.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const { Icon } = cfg

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${cfg.accent}`,
      borderRadius: '16px', overflow: 'hidden',
      animation: 'fadeIn 0.3s ease',
      animationDelay: `${index * 0.05}s`,
      animationFillMode: 'backwards'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-hover)'
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <Icon size={14} color={cfg.color} />
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {cfg.label} · {time}
        </span>
      </div>

      {/* Imagen */}
      {item.image_url && (
        <div style={{ padding: '0.875rem 1.25rem 0' }}>
          <a href={item.image_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <img
              src={item.image_url}
              alt="Adjunto"
              style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }}
            />
          </a>
        </div>
      )}

      {/* Contenido WhatsApp */}
      {item.content && (item.source === 'whatsapp_text' || item.source === 'whatsapp_audio' || item.source === 'whatsapp_photo') && (
        <div style={{ padding: '0.875rem 1.25rem' }}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
            {item.content}
          </p>
        </div>
      )}

      {/* Contenido Evento */}
      {item.source === 'event' && (
        <div style={{ padding: '0.875rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
            {item.title}
          </p>
          {item.meta?.start_time && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              🕐 {new Date(item.meta.start_time).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {item.description && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{item.description}</p>
          )}
        </div>
      )}

      {/* Contenido Tarea */}
      {item.source === 'task' && (
        <div style={{ padding: '0.875rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
            {item.title}
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {item.meta?.priority && (
              <span style={{
                fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '100px',
                color: { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' }[item.meta.priority] ?? 'var(--text-muted)',
                background: { high: 'rgba(239,68,68,0.1)', medium: 'rgba(245,158,11,0.1)', low: 'rgba(34,197,94,0.1)' }[item.meta.priority] ?? 'transparent',
              }}>
                {PRIORITY_LABEL[item.meta.priority] ?? item.meta.priority}
              </span>
            )}
            {item.meta?.due_date && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={11} /> {item.meta.due_date}
              </span>
            )}
          </div>
          {item.description && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{item.description}</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Suggestion accordion list ─── */
function SuggestionList({ suggestions }: { suggestions: DiarySuggestion[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {suggestions.map((s, i) => {
        const meta = SUGGESTION_META[s.type] ?? SUGGESTION_META.alert
        const { Icon } = meta
        const isOpen = openIdx === i

        return (
          <div
            key={i}
            style={{
              borderRadius: '10px',
              border: `1px solid ${isOpen ? meta.border : 'var(--border)'}`,
              borderLeft: `3px solid ${meta.color}`,
              background: isOpen ? meta.bg : 'var(--surface-hover)',
              overflow: 'hidden',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {/* Row title — always visible */}
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '0.6rem 0.75rem',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                background: `rgba(${hexToRgb(meta.color)}, 0.15)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={12} color={meta.color} />
              </div>

              <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}
              </span>

              <span style={{
                fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                color: meta.color, background: `rgba(${hexToRgb(meta.color)}, 0.12)`,
                padding: '1px 5px', borderRadius: '4px', flexShrink: 0,
              }}>
                {meta.label}
              </span>

              <div style={{
                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                background: PRIORITY_DOT[s.priority] ?? '#94a3b8',
              }} title={`Prioridad ${s.priority}`} />

              <ChevronDown
                size={13}
                color="var(--text-muted)"
                style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            {/* Detail — only when open */}
            {isOpen && (
              <div style={{ padding: '0 0.75rem 0.65rem 2.55rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                  {s.detail}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Skeletons ─── */
function HistorialSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {[0, 0.08, 0.16].map((d, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderLeft: '3px solid var(--border)', borderRadius: '16px', overflow: 'hidden', background: 'var(--surface)' }}>
          <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <SkPulse w={28} h={28} r={8} delay={d} />
            <SkPulse w={120} h={12} r={4} delay={d + 0.04} />
          </div>
          <div style={{ padding: '0.875rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkPulse w="100%" h={12} r={4} delay={d + 0.08} />
            <SkPulse w={`${60 + i * 10}%`} h={12} r={4} delay={d + 0.12} />
          </div>
        </div>
      ))}
    </div>
  )
}

function SummaryLoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Loader2 size={13} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Analizando actividad del día...</span>
      </div>
      <SkPulse w="100%" h={11} r={4} delay={0} />
      <SkPulse w="85%" h={11} r={4} delay={0.06} />
      <SkPulse w="70%" h={11} r={4} delay={0.12} />
    </div>
  )
}

function SuggestionsLoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {[0, 0.1].map((d, i) => (
        <div key={i} style={{ padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <SkPulse w={26} h={26} r={7} delay={d} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkPulse w="60%" h={11} r={4} delay={d + 0.04} />
              <SkPulse w="90%" h={10} r={4} delay={d + 0.08} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const skBg = `linear-gradient(90deg, var(--border) 25%, rgba(249,115,22,0.07) 50%, var(--border) 75%)`

function SkPulse({ w = '100%', h = 14, r = 6, delay = 0 }: { w?: string | number; h?: number; r?: number; delay?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, flexShrink: 0,
      background: skBg, backgroundSize: '600px 100%',
      animation: 'shimmer 1.8s ease-in-out infinite',
      animationDelay: `${delay}s`,
    }} />
  )
}

function hexToRgb(hex: string): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return '0,0,0'
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`
}
