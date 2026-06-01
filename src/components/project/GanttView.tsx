'use client'

/**
 * GanttView — carta Gantt interactiva, sincronizada con ScheduleTable via SWR.
 *
 * Características:
 *  • Barras por tarea con color de estado y relleno de progreso.
 *  • Hitos (is_milestone) como diamantes ◆.
 *  • Barras resumen (is_summary) con forma de sombrero ▬▬.
 *  • Ghost bar de línea base (baseline_start/end) con borde punteado.
 *  • Ruta crítica (critical_path=true) con borde rojo.
 *  • Flechas de dependencia en curva bezier por tipo FS/SS/FF/SF.
 *  • Arrastrar barra → mover tarea (PATCH fechas al backend).
 *  • Arrastrar handle izquierdo/derecho → redimensionar.
 *  • Tooltip con fechas durante el drag.
 *  • Zoom: día / semana / mes (cambia px por día).
 *  • Sincronización automática con ScheduleTable (misma SWR key).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { ZoomIn, ZoomOut, Flag, AlertCircle } from 'lucide-react'
import type { ProjectTask, ProjectTaskStatus, TaskDependency } from '@/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => r.json())

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const ROW_H  = 36
const LEFT_W = 280
const HEADER_H = ROW_H * 2   // mes + día

const STATUS_COLOR: Record<ProjectTaskStatus, string> = {
  pending:     '#94a3b8',
  in_progress: '#f59e0b',
  in_review:   '#8b5cf6',
  approved:    '#22c55e',
  rejected:    '#ef4444',
  completed:   '#059669',
}

const STATUS_LABEL: Record<ProjectTaskStatus, string> = {
  pending:     'Pendiente',
  in_progress: 'En progreso',
  in_review:   'En revisión',
  approved:    'Aprobada',
  rejected:    'Rechazada',
  completed:   'Completada',
}

const ZOOM_LEVELS = [
  { label: 'Día',     px: 28 },
  { label: 'Semana',  px: 18 },
  { label: 'Mes',     px: 8  },
]

// ─── Utilidades ───────────────────────────────────────────────────────────────

function toDate(s?: string | null): Date | null {
  if (!s) return null
  const d = new Date(s + 'T12:00:00Z')
  return isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props { projectId: string }

export default function GanttView({ projectId }: Props) {
  const tasksKey = `/api/projects/${projectId}/tasks`
  const depsKey  = `/api/projects/${projectId}/dependencies`

  const { data: tasksData, mutate: mutateTasks } = useSWR<{ tasks: ProjectTask[] }>(tasksKey, fetcher)
  const { data: depsData }                        = useSWR<{ dependencies: TaskDependency[] }>(depsKey, fetcher)

  const tasks: ProjectTask[]    = (tasksData?.tasks ?? []).sort((a, b) => a.sort_order - b.sort_order)
  const deps:  TaskDependency[] = depsData?.dependencies ?? []

  const [zoomIdx,    setZoomIdx]    = useState(0)
  const [dragState,  setDragState]  = useState<{
    taskId: string; mode: 'move' | 'left' | 'right'
    startX: number; origStart: Date | null; origEnd: Date | null
  } | null>(null)
  const [liveDates,  setLiveDates]  = useState<Map<string, { start: Date | null; end: Date | null }>>(new Map())
  const [tooltip,    setTooltip]    = useState<{ taskId: string; text: string } | null>(null)

  const DAY_PX = ZOOM_LEVELS[zoomIdx].px

  // Rango de fechas del proyecto
  const today = new Date()
  const allDates = tasks.flatMap(t => [toDate(t.start_date), toDate(t.end_date)]).filter(Boolean) as Date[]
  const rangeStart = allDates.length
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth(), 1)
  const rangeEnd = allDates.length
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth() + 3, 0)
  rangeStart.setDate(rangeStart.getDate() - 7)
  rangeEnd.setDate(rangeEnd.getDate() + 21)

  const totalDays  = daysBetween(rangeStart, rangeEnd)
  const totalWidth = totalDays * DAY_PX
  const todayOff   = daysBetween(rangeStart, today) * DAY_PX

  // Cabeceras de mes
  const monthHeaders: { label: string; days: number }[] = []
  let cur = new Date(rangeStart)
  while (cur < rangeEnd) {
    const y = cur.getFullYear(), m = cur.getMonth()
    const mEnd = new Date(y, m + 1, 1)
    const end  = mEnd < rangeEnd ? mEnd : rangeEnd
    monthHeaders.push({ label: `${MONTHS[m]} ${y}`, days: daysBetween(cur, end) })
    cur = mEnd
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return
    const delta = Math.round((e.clientX - dragState.startX) / DAY_PX)
    const { taskId, mode, origStart, origEnd } = dragState
    const next = new Map(liveDates)

    let ns = origStart ? new Date(origStart) : null
    let ne = origEnd   ? new Date(origEnd)   : null

    if (mode === 'move') {
      ns?.setDate(ns.getDate() + delta)
      ne?.setDate(ne.getDate() + delta)
    } else if (mode === 'left') {
      ns?.setDate(ns.getDate() + delta)
      if (ns && ne && ns >= ne) ns = new Date(ne.getTime() - 86_400_000)
    } else {
      ne?.setDate(ne.getDate() + delta)
      if (ns && ne && ne <= ns) ne = new Date(ns.getTime() + 86_400_000)
    }

    next.set(taskId, { start: ns, end: ne })
    setLiveDates(next)

    // Tooltip
    if (ns && ne) {
      setTooltip({ taskId, text: `${fmtDate(ns)} → ${fmtDate(ne)}` })
    }
  }, [dragState, liveDates, DAY_PX])

  const onMouseUp = useCallback(async () => {
    if (!dragState) return
    const ld = liveDates.get(dragState.taskId)
    if (ld) {
      const patch: Record<string, string> = {}
      if (ld.start) patch.start_date = ld.start.toISOString().slice(0, 10)
      if (ld.end)   patch.end_date   = ld.end.toISOString().slice(0, 10)
      // Optimistic update
      mutateTasks(prev => {
        if (!prev) return prev
        return { ...prev, tasks: prev.tasks.map(t => t.id === dragState.taskId ? { ...t, ...patch } : t) }
      }, false)
      // Persist
      await fetch(`/api/projects/${projectId}/tasks/${dragState.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      mutateTasks()
    }
    setDragState(null)
    setLiveDates(new Map())
    setTooltip(null)
  }, [dragState, liveDates, projectId, mutateTasks])

  useEffect(() => {
    if (!dragState) return
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',  onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',  onMouseUp)
    }
  }, [dragState, onMouseMove, onMouseUp])

  function startDrag(e: React.MouseEvent, task: ProjectTask, mode: 'move' | 'left' | 'right') {
    e.preventDefault(); e.stopPropagation()
    setDragState({ taskId: task.id, mode, startX: e.clientX, origStart: toDate(task.start_date), origEnd: toDate(task.end_date) })
  }

  // ── Flechas de dependencia ────────────────────────────────────────────────

  function depPath(dep: TaskDependency): string | null {
    const predIdx = tasks.findIndex(t => t.id === dep.predecessor_id)
    const succIdx = tasks.findIndex(t => t.id === dep.successor_id)
    if (predIdx < 0 || succIdx < 0) return null

    const pred = tasks[predIdx], succ = tasks[succIdx]
    const pS = toDate(pred.start_date), pE = toDate(pred.end_date)
    const sS = toDate(succ.start_date), sE = toDate(succ.end_date)

    let x1: number, y1: number, x2: number, y2: number

    // Anclas según tipo
    const tipo = dep.type
    if (tipo === 'FS') {
      if (!pE || !sS) return null
      x1 = daysBetween(rangeStart, pE) * DAY_PX + DAY_PX
      x2 = daysBetween(rangeStart, sS) * DAY_PX
    } else if (tipo === 'SS') {
      if (!pS || !sS) return null
      x1 = daysBetween(rangeStart, pS) * DAY_PX
      x2 = daysBetween(rangeStart, sS) * DAY_PX
    } else if (tipo === 'FF') {
      if (!pE || !sE) return null
      x1 = daysBetween(rangeStart, pE) * DAY_PX + DAY_PX
      x2 = daysBetween(rangeStart, sE) * DAY_PX + DAY_PX
    } else {  // SF
      if (!pS || !sE) return null
      x1 = daysBetween(rangeStart, pS) * DAY_PX
      x2 = daysBetween(rangeStart, sE) * DAY_PX + DAY_PX
    }

    y1 = predIdx * ROW_H + ROW_H / 2
    y2 = succIdx * ROW_H + ROW_H / 2

    // Bezier cúbico: handles horizontales
    const dist = Math.max(Math.abs(x2 - x1) * 0.5, 40)
    const cx1  = x1 + dist
    const cx2  = x2 - dist
    return `M ${x1},${y1} C ${cx1},${y1} ${cx2},${y2} ${x2},${y2}`
  }

  // ── Estado vacío ──────────────────────────────────────────────────────────

  if (tasks.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Sin partidas con fechas. Agrégalas en la vista de Tabla.
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, userSelect: 'none' }}>

      {/* Toolbar */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Leyenda */}
        {Object.entries(STATUS_COLOR).map(([k, color]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{STATUS_LABEL[k as ProjectTaskStatus]}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, border: '2px solid #ef4444', background: 'transparent' }} />
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Ruta crítica</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(148,163,184,0.25)', border: '1px dashed #94a3b8' }} />
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Línea base</span>
        </div>
        {/* Zoom */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button onClick={() => setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '3px 6px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--foreground)', minWidth: 48, textAlign: 'center' }}>
            {ZOOM_LEVELS[zoomIdx].label}
          </span>
          <button onClick={() => setZoomIdx(i => Math.max(i - 1, 0))} disabled={zoomIdx === 0}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '3px 6px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', display: 'flex', cursor: dragState ? (dragState.mode === 'move' ? 'grabbing' : 'ew-resize') : 'default' }}>

        {/* Panel izquierdo — nombres */}
        <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 4 }}>
          <div style={{ height: HEADER_H, borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'flex-end', padding: '0 10px 6px' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Partida / Sub-partida</span>
          </div>
          {tasks.map(task => (
            <div key={task.id} style={{
              height: ROW_H, display: 'flex', alignItems: 'center',
              paddingLeft: `${8 + (task.outline_level - 1) * 14}px`, paddingRight: 8,
              borderBottom: '1px solid var(--border)',
              background: task.critical_path ? 'rgba(239,68,68,0.03)' : 'transparent',
            }}>
              {task.is_milestone && <Flag size={10} color="#f59e0b" style={{ marginRight: 4, flexShrink: 0 }} />}
              {task.critical_path && <AlertCircle size={10} color="#ef4444" style={{ marginRight: 3, flexShrink: 0 }} />}
              <span style={{ fontSize: '0.74rem', fontWeight: (task.is_summary || (task as any).is_summary) ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.wbs && <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.62rem', marginRight: 5 }}>{task.wbs}</span>}
                {task.name}
              </span>
            </div>
          ))}
        </div>

        {/* Panel derecho — timeline */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <div style={{ width: Math.max(totalWidth, 600), position: 'relative' }}>

            {/* Cabecera meses */}
            <div style={{ height: ROW_H, display: 'flex', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 3 }}>
              {monthHeaders.map((mh, i) => (
                <div key={i} style={{ width: mh.days * DAY_PX, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 6, borderRight: '1px solid var(--border)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--foreground)' }}>
                  {mh.label}
                </div>
              ))}
            </div>

            {/* Cabecera días */}
            <div style={{ height: ROW_H, display: 'flex', borderBottom: '2px solid var(--border)', position: 'sticky', top: ROW_H, background: 'var(--surface)', zIndex: 3 }}>
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(rangeStart); d.setDate(d.getDate() + i)
                const isWE  = d.getDay() === 0 || d.getDay() === 6
                const isTod = daysBetween(rangeStart, d) === daysBetween(rangeStart, today)
                return (
                  <div key={i} style={{ width: DAY_PX, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.52rem', fontWeight: isTod ? 700 : 400, color: isTod ? 'var(--primary)' : isWE ? 'rgba(239,68,68,0.5)' : 'var(--text-muted)', background: isWE ? 'rgba(239,68,68,0.03)' : 'transparent', borderRight: '1px solid var(--border)' }}>
                    {DAY_PX >= 16 ? d.getDate() : null}
                  </div>
                )
              })}
            </div>

            {/* Filas + SVG overlay */}
            <div style={{ position: 'relative' }}>

              {/* Línea de hoy */}
              {todayOff >= 0 && todayOff <= totalWidth && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayOff + DAY_PX / 2, width: 2, background: '#ef4444', zIndex: 2, pointerEvents: 'none', opacity: 0.7 }}>
                  <div style={{ position: 'absolute', top: -6, left: -14, fontSize: '0.55rem', background: '#ef4444', color: 'white', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>Hoy</div>
                </div>
              )}

              {/* Flechas de dependencia — SVG bezier */}
              <svg style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: tasks.length * ROW_H + 1, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}>
                <defs>
                  <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill="#8b5cf6" opacity="0.6" />
                  </marker>
                </defs>
                {deps.map(dep => {
                  const path = depPath(dep)
                  if (!path) return null
                  return (
                    <path key={dep.id} d={path} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeOpacity={0.55} strokeDasharray="5 3" markerEnd="url(#gantt-arrow)" />
                  )
                })}
              </svg>

              {/* Filas de tareas */}
              {tasks.map((task, rowIdx) => {
                const live  = liveDates.get(task.id)
                const start = live?.start ?? toDate(task.start_date)
                const end   = live?.end   ?? toDate(task.end_date)
                const bS    = toDate(task.baseline_start)
                const bE    = toDate(task.baseline_end)

                const left  = start ? daysBetween(rangeStart, start) * DAY_PX : null
                const width = start && end ? Math.max((daysBetween(start, end) + 1) * DAY_PX, 4) : null
                const bL    = bS ? daysBetween(rangeStart, bS) * DAY_PX : null
                const bW    = bS && bE ? Math.max((daysBetween(bS, bE) + 1) * DAY_PX, 4) : null

                const color      = STATUS_COLOR[task.status]
                const isCritical = task.critical_path
                const isSummary  = (task as any).is_summary
                const isDragging = dragState?.taskId === task.id
                const isHovered  = tooltip?.taskId === task.id

                const barH  = isSummary ? 10 : 20
                const barTop = isSummary ? ROW_H / 2 - 2 : ROW_H / 2 - 10

                return (
                  <div key={task.id} style={{ height: ROW_H, borderBottom: '1px solid var(--border)', position: 'relative', background: rowIdx % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                    {/* Sombreado fines de semana */}
                    {DAY_PX >= 14 && Array.from({ length: totalDays }).map((_, i) => {
                      const d = new Date(rangeStart); d.setDate(d.getDate() + i)
                      if (d.getDay() !== 0 && d.getDay() !== 6) return null
                      return <div key={i} style={{ position: 'absolute', left: i * DAY_PX, width: DAY_PX, top: 0, bottom: 0, background: 'rgba(239,68,68,0.03)', pointerEvents: 'none' }} />
                    })}

                    {/* Ghost bar línea base */}
                    {bL !== null && bW !== null && (
                      <div style={{ position: 'absolute', left: bL + 1, width: bW - 2, height: barH, top: barTop + (isSummary ? barH : 0) + 2, borderRadius: 3, background: 'rgba(148,163,184,0.18)', border: '1px dashed #94a3b8', pointerEvents: 'none' }} />
                    )}

                    {/* Barra / Hito */}
                    {left !== null && width !== null && (
                      task.is_milestone ? (
                        // Diamante ◆
                        <div
                          title={task.name}
                          style={{ position: 'absolute', left: left + width / 2 - 8, top: ROW_H / 2 - 8, width: 16, height: 16, background: '#f59e0b', transform: 'rotate(45deg)', borderRadius: 2, zIndex: 3, cursor: 'default', boxShadow: '0 1px 4px rgba(245,158,11,0.4)' }}
                        />
                      ) : (
                        <div
                          title={task.name}
                          onMouseDown={e => startDrag(e, task, 'move')}
                          style={{
                            position: 'absolute', left: left + 2, width: Math.max(width - 4, 6),
                            height: barH, top: barTop,
                            borderRadius: isSummary ? '3px 3px 0 0' : 4,
                            background: `${color}22`,
                            border: `2px solid ${isCritical ? '#ef4444' : color}`,
                            boxShadow: isDragging ? `0 3px 12px ${color}55` : isHovered ? `0 1px 6px ${color}33` : 'none',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            overflow: 'hidden', zIndex: 3,
                            transition: isDragging ? 'none' : 'box-shadow 0.15s',
                          }}
                        >
                          {/* Progreso */}
                          <div style={{ height: '100%', width: `${task.progress}%`, background: `${color}55`, transition: isDragging ? 'none' : 'width 0.3s' }} />
                          {/* Handles de redimensionado */}
                          <div onMouseDown={e => startDrag(e, task, 'left')}
                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, cursor: 'w-resize', background: 'transparent', zIndex: 4 }} />
                          <div onMouseDown={e => startDrag(e, task, 'right')}
                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'e-resize', background: 'transparent', zIndex: 4 }} />
                          {/* Label inline si hay espacio */}
                          {width > 60 && (
                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', fontWeight: 600, color, whiteSpace: 'nowrap', pointerEvents: 'none', textShadow: '0 0 4px var(--surface)' }}>
                              {task.progress}%
                            </span>
                          )}
                        </div>
                      )
                    )}

                    {/* Tooltip drag */}
                    {isHovered && tooltip && left !== null && (
                      <div style={{ position: 'absolute', left: left + (width ?? 0) / 2, top: -24, transform: 'translateX(-50%)', background: 'var(--foreground)', color: 'var(--background)', fontSize: '0.62rem', padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>
                        {tooltip.text}
                      </div>
                    )}

                    {/* Sin fecha */}
                    {left === null && (
                      <span style={{ paddingLeft: 8, fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: `${ROW_H}px` }}>Sin fecha</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
