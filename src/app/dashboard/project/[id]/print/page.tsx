/**
 * /dashboard/project/[id]/print
 *
 * Página de impresión / exportar a PDF.
 * Renderiza el reporte del proyecto con estilos de impresión.
 * Al cargarse llama a window.print() para que el usuario guarde como PDF.
 *
 * Uso: window.open(`/dashboard/project/${projectId}/print`, '_blank')
 */
'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_ES: Record<string, string> = {
  pending:     'Pendiente',   in_progress: 'En progreso', in_review: 'En revisión',
  approved:    'Aprobada',    rejected:    'Rechazada',   completed: 'Completada',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#94a3b8', in_progress: '#f59e0b', in_review: '#8b5cf6',
  approved: '#22c55e', rejected: '#ef4444', completed: '#059669',
}

export default function PrintPage() {
  const { id } = useParams<{ id: string }>()

  const { data: projData }  = useSWR(`/api/projects`,               fetcher)
  const { data: tasksData } = useSWR(id ? `/api/projects/${id}/tasks` : null, fetcher)
  const { data: depsData }  = useSWR(id ? `/api/projects/${id}/dependencies` : null, fetcher)

  const project = projData?.projects?.find((p: any) => p.id === id)
  const tasks:  any[] = (tasksData?.tasks ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order)
  const deps:   any[] = depsData?.dependencies ?? []

  const isLoading = !tasksData

  useEffect(() => {
    if (!isLoading && tasks.length > 0) {
      // Pequeño delay para que el DOM se renderice
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [isLoading, tasks.length])

  if (isLoading) {
    return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Cargando reporte…</div>
  }

  const today    = new Date()
  const total    = tasks.length
  const progress = total ? Math.round(tasks.reduce((s, t) => s + (t.progress ?? 0), 0) / total) : 0
  const overdue  = tasks.filter(t => t.end_date && new Date(t.end_date + 'T23:59:59') < today && t.status !== 'completed' && t.status !== 'approved')
  const milestones = tasks.filter(t => t.is_milestone).sort((a, b) => (a.end_date ?? '') > (b.end_date ?? '') ? 1 : -1)
  const critical = tasks.filter(t => t.critical_path)
  const byStatus = Object.keys(STATUS_ES).reduce((acc, k) => ({ ...acc, [k]: tasks.filter(t => t.status === k).length }), {} as Record<string, number>)

  const cell: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '0.7rem' }
  const hcell: React.CSSProperties = { ...cell, fontWeight: 700, background: '#f8fafc', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b' }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 15mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; background: white; }
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>

        {/* Botón imprimir (no se imprime) */}
        <div className="no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '8px' }}>
          <button onClick={() => window.print()} style={{ padding: '8px 20px', borderRadius: 8, background: '#f97316', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
            🖨 Imprimir / Guardar PDF
          </button>
          <button onClick={() => window.close()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>

        {/* ── Encabezado ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #f97316' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>FlowDesk — Reporte de Proyecto</div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>{project?.name ?? 'Proyecto'}</h1>
            {project?.description && <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.8rem' }}>{project.description}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Fecha de reporte</p>
            <p style={{ margin: 0, fontWeight: 700 }}>{today.toLocaleDateString('es-CL', { dateStyle: 'long' })}</p>
            {project?.start_date && <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b' }}>Inicio: {project.start_date} · Fin: {project.end_date ?? '—'}</p>}
          </div>
        </div>

        {/* ── KPIs ───────────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { label: 'Avance', value: `${progress}%`, color: '#f97316' },
            { label: 'Total',  value: total,           color: '#3b82f6' },
            { label: 'Completadas', value: byStatus.completed || 0,  color: '#059669' },
            { label: 'En revisión', value: byStatus.in_review  || 0, color: '#8b5cf6' },
            { label: 'Atrasadas',   value: overdue.length,           color: '#ef4444' },
            { label: 'Críticas',    value: critical.length,          color: '#dc2626' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ border: `1px solid #e5e7eb`, borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Distribución por estado ─────────────────────────────────────────── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ height: 14, display: 'flex', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
            {Object.entries(STATUS_ES).map(([k, label]) => {
              const count = byStatus[k] || 0
              const pct   = total ? (count / total) * 100 : 0
              if (pct === 0) return null
              return <div key={k} style={{ width: `${pct}%`, background: STATUS_COLOR[k] }} title={`${label}: ${count}`} />
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(STATUS_ES).map(([k, label]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLOR[k] }} />
                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{label} ({byStatus[k] || 0})</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Cronograma completo ─────────────────────────────────────────────── */}
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>Cronograma de Trabajo</h2>
        <table style={{ marginBottom: '1.5rem' }}>
          <thead>
            <tr>
              {['EDT','Nombre','Inicio','Fin','Días','% Av.','Estado','Crítica'].map(h => <th key={h} style={hcell}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {tasks.map(t => {
              const dur = t.start_date && t.end_date
                ? Math.round((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86_400_000)
                : (t.duracion ?? '—')
              return (
                <tr key={t.id} style={{ background: t.en_ruta_critica ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                  <td style={{ ...cell, fontFamily: 'monospace', color: '#64748b', fontSize: '0.65rem' }}>{t.wbs || '—'}</td>
                  <td style={{ ...cell, paddingLeft: `${8 + (t.outline_level - 1) * 10}px`, fontWeight: t.is_summary ? 700 : 400 }}>{t.name}</td>
                  <td style={cell}>{t.start_date || '—'}</td>
                  <td style={cell}>{t.end_date   || '—'}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{dur}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{t.progress ?? 0}%</td>
                  <td style={cell}>
                    <span style={{ padding: '1px 6px', borderRadius: 100, background: `${STATUS_COLOR[t.status]}18`, color: STATUS_COLOR[t.status], fontSize: '0.62rem', fontWeight: 700 }}>
                      {STATUS_ES[t.status] ?? t.status}
                    </span>
                  </td>
                  <td style={{ ...cell, textAlign: 'center', color: t.en_ruta_critica ? '#ef4444' : '#94a3b8' }}>
                    {t.en_ruta_critica ? '●' : '○'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── Hitos y tareas atrasadas (nueva página en print) ─────────────────── */}
        <div className="page-break" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>🎯 Hitos ({milestones.length})</h2>
            <table>
              <thead><tr><th style={hcell}>Nombre</th><th style={hcell}>Fecha</th><th style={hcell}>Estado</th></tr></thead>
              <tbody>
                {milestones.length === 0
                  ? <tr><td colSpan={3} style={{ ...cell, color: '#94a3b8', fontStyle: 'italic' }}>Sin hitos</td></tr>
                  : milestones.map(t => (
                    <tr key={t.id}>
                      <td style={cell}>{t.name}</td>
                      <td style={cell}>{t.end_date ?? '—'}</td>
                      <td style={cell}><span style={{ color: STATUS_COLOR[t.status], fontWeight: 700, fontSize: '0.65rem' }}>{STATUS_ES[t.status]}</span></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          <div>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', borderBottom: '1px solid #ef4444', paddingBottom: 4, color: '#ef4444' }}>🔴 Tareas atrasadas ({overdue.length})</h2>
            <table>
              <thead><tr><th style={hcell}>EDT</th><th style={hcell}>Nombre</th><th style={hcell}>Vencimiento</th></tr></thead>
              <tbody>
                {overdue.length === 0
                  ? <tr><td colSpan={3} style={{ ...cell, color: '#94a3b8', fontStyle: 'italic' }}>Sin atrasos</td></tr>
                  : overdue.map(t => (
                    <tr key={t.id}>
                      <td style={{ ...cell, fontFamily: 'monospace', fontSize: '0.65rem', color: '#64748b' }}>{t.wbs}</td>
                      <td style={cell}>{t.name}</td>
                      <td style={{ ...cell, color: '#ef4444', fontWeight: 700 }}>{t.end_date}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Dependencias ───────────────────────────────────────────────────── */}
        {deps.length > 0 && (
          <>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>Dependencias ({deps.length})</h2>
            <table>
              <thead><tr><th style={hcell}>Predecesora</th><th style={hcell}>Tipo</th><th style={hcell}>Lag</th><th style={hcell}>Sucesora</th></tr></thead>
              <tbody>
                {deps.slice(0, 30).map((d: any) => (
                  <tr key={d.id}>
                    <td style={cell}>{d.predecessor_id ? (tasks.find(t => t.id === d.predecessor_id)?.name ?? d.predecessor_id) : '—'}</td>
                    <td style={{ ...cell, fontFamily: 'monospace', fontWeight: 700, color: '#8b5cf6' }}>{d.type}</td>
                    <td style={cell}>{d.lag_days !== 0 ? `${d.lag_days > 0 ? '+' : ''}${d.lag_days}d` : '—'}</td>
                    <td style={cell}>{d.successor_id ? (tasks.find(t => t.id === d.successor_id)?.name ?? d.successor_id) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: '2rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#94a3b8' }}>
          <span>Generado por FlowDesk · {today.toLocaleString('es-CL')}</span>
          <span>{project?.name}</span>
        </div>
      </div>
    </>
  )
}
