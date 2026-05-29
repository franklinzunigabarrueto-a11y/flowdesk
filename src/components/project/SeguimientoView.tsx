'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { FolderOpen, Folder } from 'lucide-react'
import { Project, ProjectTask } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DAY_PX = 28   // pixels per day

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function statusColor(t: ProjectTask) {
  if (t.status === 'completed') return '#22c55e'
  if (t.status === 'in_progress') return '#f59e0b'
  return '#3b82f6'
}

export default function SeguimientoView() {
  const { data: projData } = useSWR<{ projects: Project[] }>('/api/projects', fetcher)
  const projects: Project[] = projData?.projects ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const tasksKey = selectedId ? `/api/projects/${selectedId}/tasks` : null
  const { data: tasksData } = useSWR<{ tasks: ProjectTask[] }>(tasksKey, fetcher)
  const tasks: ProjectTask[] = (tasksData?.tasks ?? []).sort((a, b) => a.sort_order - b.sort_order)

  /* Compute date range for the Gantt */
  const datesWithValues = tasks.flatMap(t => [toDate(t.start_date), toDate(t.end_date)]).filter(Boolean) as Date[]
  const today = new Date()

  const rangeStart = datesWithValues.length
    ? new Date(Math.min(...datesWithValues.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth(), 1)

  const rangeEnd = datesWithValues.length
    ? new Date(Math.max(...datesWithValues.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth() + 3, 0)

  /* Pad 2 weeks on each side */
  rangeStart.setDate(rangeStart.getDate() - 14)
  rangeEnd.setDate(rangeEnd.getDate() + 14)

  const totalDays  = daysBetween(rangeStart, rangeEnd)
  const totalWidth = totalDays * DAY_PX

  /* Build month headers */
  const monthHeaders: { label: string; days: number }[] = []
  let cursor = new Date(rangeStart)
  while (cursor < rangeEnd) {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const monthEnd = new Date(y, m + 1, 1)
    const end = monthEnd < rangeEnd ? monthEnd : rangeEnd
    monthHeaders.push({ label: `${MONTHS_SHORT[m]} ${y}`, days: daysBetween(cursor, end) })
    cursor = monthEnd
  }

  /* Today line offset */
  const todayOffset = daysBetween(rangeStart, today) * DAY_PX

  /* Row height */
  const ROW_H = 36

  const LEFT_W = 320

  return (
    <div style={{ padding: '2rem', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'hidden' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Seguimiento</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
          Carta Gantt del proyecto
        </p>
      </div>

      {/* Project selector */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {projects.length === 0
          ? <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No hay proyectos. Crea uno en la sección Proyecto.</p>
          : projects.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '7px 14px', borderRadius: '10px', cursor: 'pointer',
                border: selectedId === p.id ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                background: selectedId === p.id ? 'rgba(249,115,22,0.08)' : 'var(--surface)',
                color: selectedId === p.id ? 'var(--primary)' : 'var(--foreground)',
                fontWeight: selectedId === p.id ? 600 : 400, fontSize: '0.875rem',
                transition: 'all 0.15s',
              }}
            >
              {selectedId === p.id ? <FolderOpen size={15} /> : <Folder size={15} />}
              {p.name}
            </button>
          ))
        }
      </div>

      {!selectedId ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <p>Selecciona un proyecto para ver el Gantt.</p>
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <p>Este proyecto no tiene partidas. Agrega desde la sección Proyecto.</p>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Legend */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0 }}>
            {[
              { color: '#3b82f6', label: 'Pendiente' },
              { color: '#f59e0b', label: 'En curso' },
              { color: '#22c55e', label: 'Completado' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
              <div style={{ width: '2px', height: '14px', background: '#ef4444' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hoy</span>
            </div>
          </div>

          {/* Gantt body */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', display: 'flex' }}>
            {/* Left: task names */}
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2 }}>
              {/* Header spacer */}
              <div style={{ height: ROW_H * 2, borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'flex-end', padding: '0 12px 8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Partida / Sub-partida
                </span>
              </div>
              {tasks.map(task => (
                <div key={task.id} style={{
                  height: ROW_H,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: `${12 + (task.outline_level - 1) * 16}px`,
                  paddingRight: '12px',
                  borderBottom: '1px solid var(--border)',
                  background: task.status === 'completed' ? 'rgba(34,197,94,0.03)' : 'transparent',
                }}>
                  <span style={{
                    fontSize: '0.78rem',
                    fontWeight: task.is_summary ? 600 : 400,
                    color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--foreground)',
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {task.wbs ? <span style={{ color: 'var(--text-muted)', marginRight: '6px', fontFamily: 'monospace', fontSize: '0.7rem' }}>{task.wbs}</span> : null}
                    {task.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: timeline */}
            <div style={{ flex: 1, overflowX: 'auto' }}>
              <div style={{ width: totalWidth, position: 'relative' }}>
                {/* Month + day headers */}
                <div style={{ height: ROW_H, display: 'flex', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  {monthHeaders.map((mh, i) => (
                    <div key={i} style={{
                      width: mh.days * DAY_PX, flexShrink: 0,
                      display: 'flex', alignItems: 'center',
                      paddingLeft: '8px',
                      borderRight: '1px solid var(--border)',
                      fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)',
                    }}>
                      {mh.label}
                    </div>
                  ))}
                </div>

                {/* Day numbers row */}
                <div style={{ height: ROW_H, display: 'flex', borderBottom: '2px solid var(--border)', position: 'sticky', top: ROW_H, background: 'var(--surface)', zIndex: 1 }}>
                  {Array.from({ length: totalDays }).map((_, i) => {
                    const d = new Date(rangeStart)
                    d.setDate(d.getDate() + i)
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    const isTodayDay = daysBetween(rangeStart, d) === daysBetween(rangeStart, today)
                    return (
                      <div key={i} style={{
                        width: DAY_PX, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.6rem', color: isTodayDay ? 'var(--primary)' : isWeekend ? 'rgba(239,68,68,0.6)' : 'var(--text-muted)',
                        fontWeight: isTodayDay ? 700 : 400,
                        background: isWeekend ? 'rgba(239,68,68,0.03)' : 'transparent',
                        borderRight: '1px solid var(--border)',
                      }}>
                        {d.getDate()}
                      </div>
                    )
                  })}
                </div>

                {/* Task rows */}
                <div style={{ position: 'relative' }}>
                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset <= totalWidth && (
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: todayOffset + DAY_PX / 2,
                      width: 2, background: '#ef4444',
                      zIndex: 1, pointerEvents: 'none',
                    }} />
                  )}

                  {tasks.map(task => {
                    const start = toDate(task.start_date)
                    const end   = toDate(task.end_date)
                    const left  = start ? daysBetween(rangeStart, start) * DAY_PX : null
                    const width = start && end ? (daysBetween(start, end) + 1) * DAY_PX : null
                    const color = statusColor(task)

                    return (
                      <div key={task.id} style={{
                        height: ROW_H, display: 'flex', alignItems: 'center',
                        borderBottom: '1px solid var(--border)',
                        background: task.status === 'completed' ? 'rgba(34,197,94,0.03)' : 'transparent',
                        position: 'relative',
                      }}>
                        {/* Weekend columns */}
                        {Array.from({ length: totalDays }).map((_, i) => {
                          const d = new Date(rangeStart); d.setDate(d.getDate() + i)
                          if (d.getDay() !== 0 && d.getDay() !== 6) return null
                          return <div key={i} style={{ position: 'absolute', left: i * DAY_PX, width: DAY_PX, top: 0, bottom: 0, background: 'rgba(239,68,68,0.04)', pointerEvents: 'none' }} />
                        })}

                        {left !== null && width !== null && (
                          <div style={{
                            position: 'absolute',
                            left: left + 2,
                            width: Math.max(width - 4, 4),
                            height: task.is_summary ? 10 : 20,
                            borderRadius: task.is_summary ? '2px' : '4px',
                            background: `${color}30`,
                            border: `1.5px solid ${color}`,
                            overflow: 'hidden',
                          }}>
                            {/* Progress fill */}
                            <div style={{
                              height: '100%',
                              width: `${task.progress}%`,
                              background: `${color}60`,
                              borderRadius: '2px 0 0 2px',
                              transition: 'width 0.3s',
                            }} />
                          </div>
                        )}

                        {left === null && (
                          <span style={{ paddingLeft: '8px', fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Sin fecha
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
