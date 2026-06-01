'use client'

/**
 * DashboardView — Dashboard del proyecto con filtros y exportación.
 *
 * Filtros disponibles:
 *  • Por estado (multi-select chips)
 *  • Por responsable (dropdown de miembros)
 *  • Por rango de fechas (fin de tarea)
 *
 * Exportación:
 *  • Excel (.xlsx) via GET /export/excel
 *  • PDF  via window.open /print (impresión del navegador)
 *  • CSV  via GET /export/csv
 */

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { AlertCircle, Flag, Download, FileText, FileSpreadsheet } from 'lucide-react'
import type { ProjectTask, ProjectTaskStatus, TaskDependency } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS: Record<ProjectTaskStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  in_progress: { label: 'En progreso', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  in_review:   { label: 'En revisión', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  approved:    { label: 'Aprobada',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  rejected:    { label: 'Rechazada',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  completed:   { label: 'Completada',  color: '#059669', bg: 'rgba(5,150,105,0.12)'   },
}

interface Props { projectId: string; project: { name: string } | null }

export default function DashboardView({ projectId, project }: Props) {
  const tasksKey   = `/api/projects/${projectId}/tasks`
  const depsKey    = `/api/projects/${projectId}/dependencies`
  const assignKey  = `/api/projects/${projectId}/assignments`
  const membersKey = `/api/projects/${projectId}/members`

  const { data: tasksData }   = useSWR<{ tasks: ProjectTask[] }>(tasksKey, fetcher)
  const { data: depsData }    = useSWR<{ dependencies: TaskDependency[] }>(depsKey, fetcher)
  const { data: assignData }  = useSWR(assignKey, fetcher)
  const { data: membersData } = useSWR(membersKey, fetcher)

  const tasks:   ProjectTask[]   = tasksData?.tasks   ?? []
  const deps:    TaskDependency[] = depsData?.dependencies ?? []
  const assigns: any[]           = assignData?.assignments ?? []
  const members: any[]           = membersData?.members ?? []

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set())
  const [filterMember,   setFilterMember]   = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo,   setFilterDateTo]   = useState('')

  // Mapa: userId → Set de taskIds asignados
  const memberTaskMap = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of assigns) {
      if (a.user?.id) {
        if (!m.has(a.user.id)) m.set(a.user.id, new Set())
        m.get(a.user.id)!.add(a.task_id)
      }
    }
    return m
  }, [assigns])

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (filterStatuses.size > 0 && !filterStatuses.has(t.status)) return false
    if (filterMember && !memberTaskMap.get(filterMember)?.has(t.id)) return false
    if (filterDateFrom && t.end_date && t.end_date < filterDateFrom) return false
    if (filterDateTo   && t.start_date && t.start_date > filterDateTo) return false
    return true
  }), [tasks, filterStatuses, filterMember, memberTaskMap, filterDateFrom, filterDateTo])

  const hasFilters = filterStatuses.size > 0 || filterMember || filterDateFrom || filterDateTo
  const displayTasks = filteredTasks

  // ── Métricas ─────────────────────────────────────────────────────────────────
  const today    = new Date()
  const total    = displayTasks.length
  const progress = total ? Math.round(displayTasks.reduce((s, t) => s + (t.progress ?? 0), 0) / total) : 0
  const byStatus = Object.keys(STATUS).reduce((acc, k) => ({ ...acc, [k]: displayTasks.filter(t => t.status === k).length }), {} as Record<string, number>)
  const inReview   = displayTasks.filter(t => t.status === 'in_review')
  const overdue    = displayTasks.filter(t => t.end_date && new Date(t.end_date + 'T23:59:59') < today && t.status !== 'completed' && t.status !== 'approved')
  const milestones = displayTasks.filter(t => t.is_milestone && t.end_date && new Date(t.end_date + 'T23:59:59') >= today).sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1)).slice(0, 6)
  const critList   = displayTasks.filter(t => t.critical_path)

  function toggleStatus(s: string) {
    setFilterStatuses(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  // ── Exportar ─────────────────────────────────────────────────────────────────
  function exportPDF() {
    window.open(`/dashboard/project/${projectId}/print`, '_blank')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Barra de filtros + exportación */}
      <div style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 14, padding: '0.875rem 1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Filtro por estado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Object.entries(STATUS).map(([k, v]) => (
              <button key={k} onClick={() => toggleStatus(k)}
                style={{ padding: '3px 9px', borderRadius: 100, border: `1.5px solid ${filterStatuses.has(k) ? v.color : 'var(--border)'}`, background: filterStatuses.has(k) ? v.bg : 'transparent', color: filterStatuses.has(k) ? v.color : 'var(--text-muted)', fontSize: '0.68rem', fontWeight: filterStatuses.has(k) ? 700 : 400, cursor: 'pointer' }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtro por responsable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Responsable</span>
          <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.75rem', color: 'var(--foreground)', minWidth: 130 }}>
            <option value="">Todos</option>
            {members.map((m: any) => {
              const uid = m.user?.id ?? m.id
              const uname = m.user?.name ?? m.name ?? m.id
              return <option key={uid} value={uid}>{uname}</option>
            })}
          </select>
        </div>

        {/* Filtro por fecha */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rango de fechas (fin)</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              style={{ padding: '4px 6px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.72rem', color: 'var(--foreground)' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              style={{ padding: '4px 6px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.72rem', color: 'var(--foreground)' }} />
          </div>
        </div>

        {hasFilters && (
          <button onClick={() => { setFilterStatuses(new Set()); setFilterMember(''); setFilterDateFrom(''); setFilterDateTo('') }}
            style={{ alignSelf: 'flex-end', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            ✕ Limpiar filtros
          </button>
        )}

        {/* Exportar */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <a href={`/api/projects/${projectId}/export/csv`} download
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#16a34a', fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none' }}>
            <Download size={12} /> CSV
          </a>
          <a href={`/api/projects/${projectId}/export/excel`} download
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)', color: '#2563eb', fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none' }}>
            <FileSpreadsheet size={12} /> Excel
          </a>
          <button onClick={exportPDF}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
            <FileText size={12} /> PDF
          </button>
        </div>
      </div>

      {hasFilters && (
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Mostrando <strong>{displayTasks.length}</strong> de {tasks.length} tareas con los filtros aplicados.
        </p>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {[
          { label: 'Avance global',  value: `${progress}%`, color: 'var(--primary)', sub: `${total} partidas` },
          { label: 'Completadas',    value: byStatus.completed  || 0, color: '#059669' },
          { label: 'En progreso',    value: byStatus.in_progress|| 0, color: '#f59e0b' },
          { label: 'En revisión',    value: byStatus.in_review  || 0, color: '#8b5cf6' },
          { label: 'Rechazadas',     value: byStatus.rejected   || 0, color: '#ef4444' },
          { label: 'Atrasadas',      value: overdue.length,           color: '#dc2626', sub: 'sin completar' },
          { label: 'Ruta crítica',   value: critList.length,          color: '#ef4444', sub: 'tareas críticas' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.875rem 1rem', borderLeft: `4px solid ${c.color}` }}>
            <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</p>
            <p style={{ margin: '4px 0 0', fontSize: '1.6rem', fontWeight: 800, color: c.color }}>{c.value}</p>
            {c.sub && <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Barra de distribución */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.875rem 1.25rem' }}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', fontWeight: 700 }}>Distribución por estado</p>
        {total === 0 ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sin tareas</p>
        ) : (<>
          <div style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
            {Object.entries(STATUS).map(([k, v]) => {
              const count = byStatus[k] || 0
              const pct   = (count / total) * 100
              if (pct === 0) return null
              return (
                <div key={k} style={{ width: `${pct}%`, background: v.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={`${v.label}: ${count}`}>
                  {pct > 8 && <span style={{ fontSize: '0.58rem', color: 'white', fontWeight: 700 }}>{count}</span>}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {Object.entries(STATUS).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: v.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{v.label} ({byStatus[k] || 0})</span>
              </div>
            ))}
          </div>
        </>)}
      </div>

      {/* Cuadrícula de listas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* En revisión */}
        <ListCard title={`⏳ En revisión (${inReview.length})`} empty="Sin tareas pendientes de aprobación">
          {inReview.map(t => (
            <ListRow key={t.id} wbs={t.wbs} name={t.name}>
              <span style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '0.72rem' }}>{t.progress_proposed}%</span>
            </ListRow>
          ))}
        </ListCard>

        {/* Atrasadas */}
        <ListCard title={`🔴 Atrasadas (${overdue.length})`} empty="Sin tareas atrasadas" accent="#ef4444">
          {overdue.slice(0, 8).map(t => (
            <ListRow key={t.id} wbs={t.wbs} name={t.name}>
              <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.72rem' }}>{t.end_date}</span>
            </ListRow>
          ))}
        </ListCard>

        {/* Próximos hitos */}
        <ListCard title={`🎯 Próximos hitos (${milestones.length})`} empty="Sin hitos próximos">
          {milestones.map(t => (
            <ListRow key={t.id} name={t.name} icon={<Flag size={10} color="#f59e0b" />}>
              <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.72rem' }}>{t.end_date}</span>
            </ListRow>
          ))}
        </ListCard>

        {/* Ruta crítica */}
        <ListCard title={`🔥 Ruta crítica (${critList.length})`} empty={deps.length === 0 ? 'Agrega dependencias para calcular la ruta crítica' : 'Sin tareas críticas'}>
          {critList.slice(0, 8).map(t => (
            <ListRow key={t.id} wbs={t.wbs} name={t.name} icon={<AlertCircle size={10} color="#ef4444" />}>
              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 100, background: STATUS[t.status].bg, color: STATUS[t.status].color, fontWeight: 600 }}>
                {STATUS[t.status].label}
              </span>
            </ListRow>
          ))}
        </ListCard>
      </div>
    </div>
  )
}

// ─── Micro-componentes ────────────────────────────────────────────────────────

function ListCard({ title, children, empty, accent }: { title: string; children: React.ReactNode; empty: string; accent?: string }) {
  const hasChildren = Array.isArray(children) ? children.some(Boolean) : !!children
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${accent ?? 'var(--border)'}`, borderRadius: 12, padding: '0.875rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', fontWeight: 700 }}>{title}</p>
      {!hasChildren
        ? <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{empty}</p>
        : children
      }
    </div>
  )
}

function ListRow({ wbs, name, children, icon }: { wbs?: string | null; name: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '0.75rem' }}>
      {icon}
      {wbs && <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.62rem', flexShrink: 0 }}>{wbs}</span>}
      <span style={{ flex: 1, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {children}
    </div>
  )
}
