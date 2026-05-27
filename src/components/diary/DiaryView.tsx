'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  BookOpen, Mic, Search, ChevronLeft, ChevronRight,
  ImageIcon, Sparkles, CalendarCheck, Mail, AlertTriangle, ShieldAlert, Loader2
} from 'lucide-react'
import { DiaryEntry } from '@/types'
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

export default function DiaryView() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')

  const swrKey = `/api/diary?date=${selectedDate}${committedQuery ? `&q=${encodeURIComponent(committedQuery)}` : ''}`
  const { data } = useSWR(swrKey, fetcher)
  const entries: DiaryEntry[] = data?.entries ?? []
  const loading = !data

  // Summary only fires when entries exist and no search filter active
  const summaryKey = data && entries.length > 0 && !committedQuery
    ? `/api/diary/summary?date=${selectedDate}`
    : null
  const { data: summaryData, isLoading: summaryLoading } = useSWR(summaryKey, fetcher)
  const summary: string | null = summaryData?.summary ?? null
  const suggestions: DiarySuggestion[] = summaryData?.suggestions ?? []
  const aiError: boolean = summaryData?.aiError ?? false

  function changeDay(delta: number) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const isSelectedToday = isToday(new Date(selectedDate + 'T12:00:00'))

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bitácora de obra</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
          Tu registro diario desde WhatsApp
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
              width: '100%', padding: '8px 12px 8px 38px', borderRadius: '10px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Layout principal: 2 columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── COLUMNA IZQUIERDA: Historial ── */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '1rem', paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border)'
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Historial WhatsApp
            </span>
            {!loading && entries.length > 0 && (
              <span style={{
                fontSize: '0.72rem', color: 'var(--primary)',
                background: 'rgba(249,115,22,0.1)', padding: '2px 8px', borderRadius: '100px', fontWeight: 600
              }}>
                {entries.length} entrada{entries.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <HistorialSkeleton />
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
                Envía un mensaje de texto, audio o foto a tu bot de WhatsApp<br />
                y aparecerá aquí automáticamente.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {entries.map((entry, i) => (
                <EntryCard key={entry.id} entry={entry} index={i} />
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
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>Generado con IA</p>
              </div>
            </div>

            <div style={{ padding: '1rem 1.25rem', minHeight: '80px' }}>
              {!summaryKey ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {loading ? 'Cargando entradas...' : 'Sin actividad registrada para generar resumen.'}
                </p>
              ) : summaryLoading ? (
                <SummaryLoadingState />
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
              ) : suggestions.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, padding: '0.25rem 0.375rem' }}>
                  Sin sugerencias específicas para este día.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {suggestions.map((s, i) => (
                    <SuggestionCard key={i} suggestion={s} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Entry card ─── */
function EntryCard({ entry, index }: { entry: DiaryEntry; index: number }) {
  const isAudio = Boolean(entry.audio_url)
  const isPhoto = Boolean(entry.image_url)

  const borderColor = isAudio ? '#ef4444' : isPhoto ? '#22c55e' : 'var(--primary)'
  const iconBg = isAudio ? 'rgba(239,68,68,0.1)' : isPhoto ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)'
  const iconBorder = isAudio ? 'rgba(239,68,68,0.2)' : isPhoto ? 'rgba(34,197,94,0.2)' : 'rgba(249,115,22,0.2)'
  const iconColor = isAudio ? '#ef4444' : isPhoto ? '#22c55e' : 'var(--primary)'
  const label = isAudio ? 'Audio transcrito' : isPhoto ? 'Foto de obra' : 'Mensaje de texto'
  const Icon = isAudio ? Mic : isPhoto ? ImageIcon : BookOpen

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${borderColor}`,
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
          background: iconBg, border: `1px solid ${iconBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <Icon size={14} color={iconColor} />
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {label} · {new Date(entry.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {entry.task_references && entry.task_references.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--primary)',
            background: 'rgba(249,115,22,0.1)', padding: '2px 8px', borderRadius: '100px'
          }}>
            {entry.task_references.length} tarea{entry.task_references.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Imagen (si aplica) */}
      {entry.image_url && (
        <div style={{ padding: '0.875rem 1.25rem 0' }}>
          <a href={entry.image_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <img
              src={entry.image_url}
              alt="Foto de obra"
              style={{
                width: '100%', maxHeight: '220px', objectFit: 'cover',
                borderRadius: '10px', border: '1px solid var(--border)', display: 'block'
              }}
            />
          </a>
        </div>
      )}

      {/* Contenido */}
      {entry.content && (
        <div style={{ padding: '0.875rem 1.25rem' }}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
            {entry.content}
          </p>
        </div>
      )}
    </div>
  )
}

/* ─── Suggestion card ─── */
function SuggestionCard({ suggestion }: { suggestion: DiarySuggestion }) {
  const meta = SUGGESTION_META[suggestion.type] ?? SUGGESTION_META.alert
  const { Icon } = meta

  return (
    <div style={{
      padding: '0.75rem', borderRadius: '12px',
      background: meta.bg, border: `1px solid ${meta.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{
          width: '26px', height: '26px', borderRadius: '7px',
          background: `rgba(${hexToRgb(meta.color)}, 0.15)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px'
        }}>
          <Icon size={13} color={meta.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>
              {suggestion.title}
            </span>
            <span style={{
              fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: meta.color, background: `rgba(${hexToRgb(meta.color)}, 0.12)`,
              padding: '1px 5px', borderRadius: '4px', flexShrink: 0
            }}>
              {meta.label}
            </span>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: PRIORITY_DOT[suggestion.priority] ?? '#94a3b8',
              marginLeft: 'auto', flexShrink: 0
            }} title={`Prioridad ${suggestion.priority}`} />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
            {suggestion.detail}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─── Skeleton historial ─── */
function HistorialSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {[0, 0.08, 0.16].map((d, i) => (
        <div key={i} style={{
          border: '1px solid var(--border)', borderLeft: '3px solid var(--border)',
          borderRadius: '16px', overflow: 'hidden', background: 'var(--surface)'
        }}>
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

/* ─── Loading states para panel derecho ─── */
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

/* ─── Skeleton base ─── */
const skBg = `linear-gradient(90deg, var(--border) 25%, rgba(249,115,22,0.07) 50%, var(--border) 75%)`

function SkPulse({ w = '100%', h = 14, r = 6, delay = 0 }: {
  w?: string | number; h?: number; r?: number; delay?: number
}) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, flexShrink: 0,
      background: skBg, backgroundSize: '600px 100%',
      animation: 'shimmer 1.8s ease-in-out infinite',
      animationDelay: `${delay}s`,
    }} />
  )
}

/* ─── Helper ─── */
function hexToRgb(hex: string): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return '0,0,0'
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`
}
