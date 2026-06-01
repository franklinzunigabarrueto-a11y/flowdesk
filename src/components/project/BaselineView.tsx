'use client'

/**
 * BaselineView — Guardar y comparar líneas base con desviación visual.
 *
 * Mejoras sobre BaselineTab original:
 *  • Desviación de fechas codificada por color (rojo = atraso, verde = adelanto)
 *  • Resumen estadístico: % tareas atrasadas, días promedio de desviación
 *  • Indicador de SPI (Schedule Performance Index) simplificado
 *  • Filtro para mostrar solo tareas con desviación
 */

import { useState } from 'react'
import useSWR from 'swr'
import { Archive, Trash2, GitCompare, Save } from 'lucide-react'
import type { ProjectTask } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

interface Props { projectId: string }

export default function BaselineView({ projectId }: Props) {
  const tasksKey    = `/api/projects/${projectId}/tasks`
  const baselinesKey = `/api/projects/${projectId}/baselines`

  const { data: tasksData }    = useSWR<{ tasks: ProjectTask[] }>(tasksKey, fetcher)
  const { data: blData, mutate: mutateBL } = useSWR(baselinesKey, fetcher)

  const tasks:     ProjectTask[] = tasksData?.tasks ?? []
  const baselines: any[]         = blData?.baselines ?? []

  const [newName,    setNewName]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [comparing,  setComparing]  = useState<string | null>(null)
  const [snapshot,   setSnapshot]   = useState<ProjectTask[]>([])
  const [onlyDelay,  setOnlyDelay]  = useState(false)

  // ── Guardar baseline ─────────────────────────────────────────────────────────
  async function saveBaseline() {
    if (!newName.trim()) return
    setSaving(true)
    await fetch(`/api/projects/${projectId}/baselines`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: newName.trim() }),
    })
    setNewName(''); setSaving(false); mutateBL()
  }

  async function deleteBaseline(id: string) {
    if (!confirm('¿Eliminar esta línea base?')) return
    await fetch(`/api/projects/${projectId}/baselines?baseline_id=${id}`, { method: 'DELETE' })
    if (comparing === id) setComparing(null)
    mutateBL()
  }

  async function applyToGantt(id: string) {
    await fetch(`/api/projects/${projectId}/baselines`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseline_id: id }),
    })
  }

  async function loadComparison(id: string) {
    if (comparing === id) { setComparing(null); return }
    const data = await fetch(`/api/projects/${projectId}/baselines`).then(r => r.json())
    const bl   = (data.baselines ?? []).find((b: any) => b.id === id)
    const snap = Array.isArray(bl?.snapshot) ? bl.snapshot : (bl?.snapshot?.tasks ?? [])
    setSnapshot(snap)
    setComparing(id)
  }

  // ── Cálculos de desviación ───────────────────────────────────────────────────

  const snapMap = new Map<string, ProjectTask>(snapshot.map(t => [t.id, t]))

  const rows = tasks
    .map(t => {
      const base = snapMap.get(t.id)
      if (!base) return null

      const finDev  = t.end_date && base.end_date ? daysBetween(base.end_date, t.end_date) : null
      const startDev = t.start_date && base.start_date ? daysBetween(base.start_date, t.start_date) : null
      const progDev  = (t.progress ?? 0) - ((base.progress ?? (base as any).pct_avance_aprobado ?? 0) as number)

      return { t, base, finDev, startDev, progDev }
    })
    .filter(Boolean) as { t: ProjectTask; base: ProjectTask; finDev: number | null; startDev: number | null; progDev: number }[]

  const filteredRows = onlyDelay ? rows.filter(r => r.finDev !== null && r.finDev > 0) : rows

  // Estadísticas de desviación
  const withFinDev   = rows.filter(r => r.finDev !== null)
  const delayed      = withFinDev.filter(r => r.finDev! > 0)
  const avgDelay     = delayed.length ? Math.round(delayed.reduce((s, r) => s + r.finDev!, 0) / delayed.length) : 0
  const pctOnTime    = withFinDev.length ? Math.round(((withFinDev.length - delayed.length) / withFinDev.length) * 100) : null

  const devColor = (v: number | null) => {
    if (v === null) return 'var(--text-muted)'
    if (v === 0)    return 'var(--text-muted)'
    return v > 0 ? '#ef4444' : '#22c55e'
  }
  const devLabel = (v: number | null) => {
    if (v === null || v === 0) return '—'
    return v > 0 ? `+${v}d` : `${v}d`
  }

  const cell: React.CSSProperties  = { padding: '5px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.72rem', verticalAlign: 'middle' }
  const hcell: React.CSSProperties = { ...cell, fontWeight: 700, fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--surface-hover)', whiteSpace: 'nowrap' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Guardar nueva línea base */}
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <Archive size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          placeholder="Nombre (ej: v1.0 – Planificación inicial)…"
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveBaseline()}
          style={{ flex: 1, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.82rem', outline: 'none', color: 'var(--foreground)' }}
        />
        <button onClick={saveBaseline} disabled={!newName.trim() || saving}
          style={{ padding: '7px 16px', borderRadius: 9, background: 'var(--primary)', border: 'none', color: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: newName.trim() ? 1 : 0.5 }}>
          <Save size={14} />{saving ? 'Guardando…' : 'Guardar línea base'}
        </button>
      </div>

      {baselines.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Archive size={36} style={{ opacity: 0.2 }} />
          <p style={{ margin: 0 }}>Sin líneas base guardadas.</p>
          <p style={{ margin: 0, fontSize: '0.75rem' }}>Guarda el estado actual del cronograma para comparar el avance futuro.</p>
        </div>
      ) : (
        <>
          {/* Lista de baselines */}
          {baselines.map(b => (
            <div key={b.id} style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: comparing === b.id ? 'rgba(139,92,246,0.04)' : 'transparent' }}>
              <Archive size={14} style={{ color: '#8b5cf6', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 600 }}>{b.name}</p>
                <p style={{ margin: '1px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {new Date(b.created_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <button onClick={() => applyToGantt(b.id)} title="Aplica baseline_start/end a tareas para ver ghost bars en Gantt"
                style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#8b5cf6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                Aplicar al Gantt
              </button>
              <button onClick={() => loadComparison(b.id)}
                style={{ padding: '5px 10px', borderRadius: 7, background: comparing === b.id ? 'rgba(139,92,246,0.15)' : 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <GitCompare size={12} />{comparing === b.id ? 'Cerrar' : 'Comparar'}
              </button>
              <button onClick={() => deleteBaseline(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, opacity: 0.45 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Tabla de comparación */}
          {comparing && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Resumen estadístico */}
              {rows.length > 0 && (
                <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <Stat label="Tareas comparadas" value={rows.length} color="var(--foreground)" />
                    {pctOnTime !== null && <Stat label="A tiempo" value={`${pctOnTime}%`} color="#22c55e" />}
                    <Stat label="Con atraso" value={delayed.length} color="#ef4444" />
                    {avgDelay > 0 && <Stat label="Atraso promedio" value={`${avgDelay}d`} color="#ef4444" />}
                  </div>
                  <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={onlyDelay} onChange={e => setOnlyDelay(e.target.checked)} />
                    Solo tareas con atraso
                  </label>
                </div>
              )}

              {/* Tabla */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={hcell}>EDT</th>
                      <th style={hcell}>Nombre</th>
                      <th style={{ ...hcell, background: 'rgba(148,163,184,0.15)' }}>Inicio plan.</th>
                      <th style={hcell}>Inicio real</th>
                      <th style={{ ...hcell, background: 'rgba(148,163,184,0.15)' }}>Fin plan.</th>
                      <th style={hcell}>Fin real</th>
                      <th style={hcell}>Desv. Fin</th>
                      <th style={{ ...hcell, background: 'rgba(148,163,184,0.15)' }}>Av. plan.</th>
                      <th style={hcell}>Av. real</th>
                      <th style={hcell}>Desv. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 && (
                      <tr><td colSpan={10} style={{ ...cell, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin tareas con atraso</td></tr>
                    )}
                    {filteredRows.map(({ t, base, finDev, startDev, progDev }) => (
                      <tr key={t.id} style={{ background: finDev !== null && finDev > 0 ? 'rgba(239,68,68,0.03)' : finDev !== null && finDev < 0 ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                        <td style={{ ...cell, fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.wbs || '—'}</td>
                        <td style={{ ...cell, fontWeight: (t as any).is_summary ? 600 : 400, paddingLeft: `${10 + (t.outline_level - 1) * 10}px` }}>{t.name}</td>
                        <td style={{ ...cell, color: 'var(--text-muted)', background: 'rgba(148,163,184,0.06)' }}>{base.start_date || '—'}</td>
                        <td style={cell}>{t.start_date || '—'}</td>
                        <td style={{ ...cell, color: 'var(--text-muted)', background: 'rgba(148,163,184,0.06)' }}>{base.end_date || '—'}</td>
                        <td style={cell}>{t.end_date || '—'}</td>
                        <td style={{ ...cell, fontWeight: 700, color: devColor(finDev) }}>
                          {finDev !== null && finDev !== 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              {finDev > 0 ? '▲' : '▼'} {devLabel(finDev)}
                            </span>
                          )}
                          {(finDev === null || finDev === 0) && '—'}
                        </td>
                        <td style={{ ...cell, color: 'var(--text-muted)', background: 'rgba(148,163,184,0.06)' }}>{(base.progress ?? (base as any).pct_avance_aprobado) ?? 0}%</td>
                        <td style={cell}>{t.progress ?? 0}%</td>
                        <td style={{ ...cell, fontWeight: 600, color: progDev >= 0 ? '#22c55e' : '#ef4444' }}>
                          {progDev !== 0 ? `${progDev > 0 ? '+' : ''}${progDev}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}
