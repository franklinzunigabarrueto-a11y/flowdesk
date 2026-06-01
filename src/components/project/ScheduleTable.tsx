'use client'

import { useState, useRef } from 'react'
import useSWR from 'swr'
import {
  ChevronRight, ChevronDown, Plus, Trash2, History,
  CheckCircle, XCircle, RefreshCw, ArrowUp, ArrowDown,
  Indent, Outdent, AlertCircle, Flag,
} from 'lucide-react'
import type { ProjectTask, ProjectTaskStatus } from '@/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS: Record<ProjectTaskStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  in_progress: { label: 'En progreso', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  in_review:   { label: 'En revisión', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  approved:    { label: 'Aprobada',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  rejected:    { label: 'Rechazada',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  completed:   { label: 'Completada',  color: '#059669', bg: 'rgba(5,150,105,0.12)'   },
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Member { id: string; name: string; email: string; role: string; is_owner?: boolean; user?: { id: string; name: string } }
interface Assignment { id: string; task_id: string; user_id: string | null; user?: { id: string; name: string } }
interface Log { id: string; action: string; comment: string | null; user_name: string; created_at: string }

// ─── Utilidades ───────────────────────────────────────────────────────────────

function calcDuration(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null
  const d = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)
  return Math.max(0, d)
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props { projectId: string }

export default function ScheduleTable({ projectId }: Props) {
  const tasksKey   = `/api/projects/${projectId}/tasks`
  const membersKey = `/api/projects/${projectId}/members`
  const assignKey  = `/api/projects/${projectId}/assignments`

  const { data: tasksData,   mutate: mutateTasks }   = useSWR<{ tasks: ProjectTask[]; role: string }>(tasksKey, fetcher)
  const { data: membersData }                         = useSWR<{ members: Member[] }>(membersKey, fetcher)
  const { data: assignData,  mutate: mutateAssign }   = useSWR<{ assignments: Assignment[] }>(assignKey, fetcher)

  const tasks:   ProjectTask[] = tasksData?.tasks ?? []
  const members: Member[]      = membersData?.members ?? []
  const assigns: Assignment[]  = assignData?.assignments ?? []
  const role                   = tasksData?.role ?? 'professional'
  const isAdmin                = role === 'admin'

  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [saving,      setSaving]      = useState<Record<string, boolean>>({})
  const [showLogs,    setShowLogs]    = useState<string | null>(null)
  const [logs,        setLogs]        = useState<Log[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [proposeOpen, setProposeOpen] = useState<string | null>(null)
  const [proposeVal,  setProposeVal]  = useState(0)
  const [rejectOpen,  setRejectOpen]  = useState<string | null>(null)
  const [rejectNote,  setRejectNote]  = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const roots    = tasks.filter(t => !t.parent_id).sort((a, b) => a.sort_order - b.sort_order)
  const childOf  = (id: string) => tasks.filter(t => t.parent_id === id).sort((a, b) => a.sort_order - b.sort_order)
  const assignMap = new Map(assigns.map(a => [a.task_id, a]))

  // ── API helpers ─────────────────────────────────────────────────────────────

  async function api(path: string, method: string, body?: object) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return res.json()
  }

  async function updateTask(taskId: string, patch: Partial<ProjectTask>) {
    setSaving(s => ({ ...s, [taskId]: true }))
    await api(`/api/projects/${projectId}/tasks/${taskId}`, 'PATCH', patch)
    await mutateTasks()
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  async function deleteTask(taskId: string) {
    const children = childOf(taskId)
    const msg = children.length
      ? `Esta partida tiene ${children.length} sub-partidas que también se eliminarán. ¿Continuar?`
      : '¿Eliminar esta partida?'
    if (!confirm(msg)) return
    await api(`/api/projects/${projectId}/tasks/${taskId}`, 'DELETE')
    await mutateTasks()
  }

  async function addTask(parentId: string | null, outlineLevel: number) {
    const name = prompt('Nombre de la partida:')
    if (!name?.trim()) return
    await api(`/api/projects/${projectId}/tasks`, 'POST', {
      name: name.trim(), parent_id: parentId, outline_level: outlineLevel,
    })
    await mutateTasks()
  }

  async function move(taskId: string, action: 'indent' | 'outdent' | 'move_up' | 'move_down') {
    setSaving(s => ({ ...s, [taskId]: true }))
    await api(`/api/projects/${projectId}/tasks/${taskId}/move`, 'POST', { action })
    await mutateTasks()
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  async function transition(taskId: string, action: string, extra?: object) {
    setSaving(s => ({ ...s, [taskId]: true }))
    const res = await api(`/api/projects/${projectId}/tasks/${taskId}/transition`, 'POST', { action, ...extra })
    if (res.error) alert(res.error)
    await mutateTasks()
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  async function setResponsable(taskId: string, userId: string) {
    const existing = assignMap.get(taskId)
    if (existing?.user_id === userId) return
    await api(`/api/projects/${projectId}/assignments`, 'POST', { task_id: taskId, user_id: userId, units: 1 })
    await mutateAssign()
  }

  async function loadLogs(taskId: string) {
    setLogsLoading(true)
    setShowLogs(taskId)
    const data = await api(`/api/projects/${projectId}/tasks/${taskId}/logs`, 'GET')
    setLogs(data.logs ?? [])
    setLogsLoading(false)
  }

  // ── Render tabla ─────────────────────────────────────────────────────────────

  const COLS = '24px 52px 1fr 108px 108px 72px 100px 140px 114px 72px'

  function Header() {
    const cell = (label: string) => (
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
    )
    return (
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '5px 12px', borderBottom: '2px solid var(--border)', background: 'var(--surface-hover)', alignItems: 'center' }}>
        <div /> {cell('EDT')} {cell('Nombre')} {cell('Inicio')} {cell('Fin')}
        {cell('Días')} {cell('% Avance')} {cell('Responsable')} {cell('Estado')} <div />
      </div>
    )
  }

  function TaskRow({ task, depth }: { task: ProjectTask; depth: number }) {
    const [editName, setEditName]   = useState(false)
    const [nameVal,  setNameVal]    = useState(task.name)
    const hasChildren = childOf(task.id).length > 0
    const isExpanded  = expanded.has(task.id)
    const isBusy      = saving[task.id]
    const isCritical  = task.critical_path
    const assignee    = assignMap.get(task.id)
    const responsableId = assignee?.user_id ?? ''
    const dur         = task.duration_days ?? calcDuration(task.start_date, task.end_date)
    const st          = STATUS[task.status]

    function saveName() {
      setEditName(false)
      if (nameVal.trim() && nameVal !== task.name) updateTask(task.id, { name: nameVal.trim() })
    }

    return (
      <>
        {/* ─── Fila principal ──────────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 0,
            padding: '4px 12px', alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            borderLeft: isCritical ? '3px solid rgba(239,68,68,0.55)' : '3px solid transparent',
            background: isBusy ? 'rgba(249,115,22,0.04)' : isCritical ? 'rgba(239,68,68,0.02)' : 'transparent',
            opacity: isBusy ? 0.75 : 1,
            transition: 'background 0.1s',
          }}
        >
          {/* Expand */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {hasChildren && (
              <button onClick={() => setExpanded(p => { const n = new Set(p); isExpanded ? n.delete(task.id) : n.add(task.id); return n })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px', display: 'flex' }}>
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            )}
          </div>

          {/* WBS */}
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '3px' }}>
            {task.is_milestone && <Flag size={9} color="#f59e0b" />}
            {isCritical && <AlertCircle size={9} color="#ef4444" />}
            {task.wbs || '—'}
          </div>

          {/* Nombre */}
          <div style={{ paddingLeft: `${depth * 16}px`, display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
            {editName ? (
              <input autoFocus value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditName(false); setNameVal(task.name) } }}
                style={{ flex: 1, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--primary)', background: 'var(--background)', fontSize: '0.8rem', outline: 'none', color: 'var(--foreground)' }} />
            ) : (
              <span onDoubleClick={() => setEditName(true)}
                title="Doble clic para editar"
                style={{ fontSize: '0.8rem', fontWeight: hasChildren ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1, color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--foreground)', textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                {task.name}
              </span>
            )}
            <button onClick={() => addTask(task.id, (task.outline_level ?? 1) + 1)} title="Agregar sub-partida"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', opacity: 0.5, flexShrink: 0 }}>
              <Plus size={10} />
            </button>
          </div>

          {/* Inicio */}
          <div>
            <input type="date" value={task.start_date || ''}
              onChange={e => updateTask(task.id, { start_date: e.target.value || null })}
              style={{ fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '100px' }} />
          </div>

          {/* Fin */}
          <div>
            <input type="date" value={task.end_date || ''}
              onChange={e => updateTask(task.id, { end_date: e.target.value || null })}
              style={{ fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '100px' }} />
          </div>

          {/* Duración */}
          <div>
            <input type="number" min={1} value={dur ?? ''}
              placeholder="—"
              onChange={e => {
                const days = parseInt(e.target.value)
                if (!isNaN(days) && days > 0 && task.start_date) {
                  updateTask(task.id, { end_date: addDays(task.start_date, days), duration_days: days })
                }
              }}
              style={{ width: '52px', fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }} />
          </div>

          {/* % Avance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', maxWidth: '56px' }}>
                <div style={{ height: '100%', width: `${task.progress}%`, background: task.progress >= 100 ? '#059669' : '#22c55e', transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', minWidth: '28px' }}>{task.progress}%</span>
            </div>
            {task.progress_proposed !== task.progress && (
              <div style={{ fontSize: '0.6rem', color: '#8b5cf6' }}>prop: {task.progress_proposed}%</div>
            )}
          </div>

          {/* Responsable */}
          <div>
            <select value={responsableId}
              onChange={e => e.target.value && setResponsable(task.id, e.target.value)}
              style={{ width: '100%', fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}>
              <option value="">Sin asignar</option>
              {members.map(m => {
                const uid = m.user?.id ?? m.id
                const uname = m.user?.name ?? m.id
                return <option key={uid} value={uid}>{uname}</option>
              })}
            </select>
          </div>

          {/* Estado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 7px', borderRadius: '100px', background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
              {st.label}
            </span>
            {/* Acciones de transición */}
            {task.status === 'pending' && (
              <button onClick={() => transition(task.id, 'start')} title="Iniciar"
                style={btnStyle('#f59e0b')}><RefreshCw size={10} /></button>
            )}
            {task.status === 'in_progress' && (
              <button onClick={() => { setProposeOpen(task.id); setProposeVal(task.progress_proposed) }} title="Reportar avance"
                style={btnStyle('#8b5cf6')}>▲</button>
            )}
            {task.status === 'in_review' && isAdmin && (<>
              <button onClick={() => transition(task.id, 'approve')} title="Aprobar"
                style={btnStyle('#22c55e')}><CheckCircle size={10} /></button>
              <button onClick={() => { setRejectOpen(task.id); setRejectNote('') }} title="Rechazar"
                style={btnStyle('#ef4444')}><XCircle size={10} /></button>
            </>)}
            {task.status === 'approved' && isAdmin && (
              <button onClick={() => transition(task.id, 'complete')} title="Completar"
                style={btnStyle('#059669')}><CheckCircle size={10} /></button>
            )}
            {task.status === 'rejected' && (
              <button onClick={() => transition(task.id, 'reopen')} title="Reintentar"
                style={btnStyle('#f59e0b')}><RefreshCw size={10} /></button>
            )}
            {(task.status === 'completed' || task.status === 'approved' || task.status === 'in_review') && (
              <button
                onClick={() => { if (confirm('¿Resetear a Pendiente? Se borrará el avance registrado.')) updateTask(task.id, { status: 'pending' as any, progress: 0, progress_proposed: 0 }) }}
                title="Resetear a Pendiente"
                style={btnStyle('#94a3b8')}>↺</button>
            )}
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: '1px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Btn onClick={() => move(task.id, 'outdent')}  title="Desindentar" icon={<Outdent size={11} />} />
            <Btn onClick={() => move(task.id, 'indent')}   title="Indentar"    icon={<Indent size={11} />} />
            <Btn onClick={() => move(task.id, 'move_up')}  title="Subir"       icon={<ArrowUp size={11} />} />
            <Btn onClick={() => move(task.id, 'move_down')} title="Bajar"      icon={<ArrowDown size={11} />} />
            <Btn onClick={() => showLogs === task.id ? setShowLogs(null) : loadLogs(task.id)} title="Historial" icon={<History size={11} />} active={showLogs === task.id} />
            <Btn onClick={() => deleteTask(task.id)} title="Eliminar" icon={<Trash2 size={11} />} danger />
          </div>
        </div>

        {/* ─── Panel: proponer avance ────────────────────────────────────── */}
        {proposeOpen === task.id && (
          <div style={{ padding: '8px 48px', background: 'rgba(139,92,246,0.05)', borderBottom: '1px solid rgba(139,92,246,0.15)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Avance %</label>
            <input type="range" min={0} max={100} value={proposeVal} onChange={e => setProposeVal(Number(e.target.value))}
              style={{ flex: 1, maxWidth: '160px' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '36px' }}>{proposeVal}%</span>
            <button onClick={async () => { await transition(task.id, 'propose', { pct_avance: proposeVal }); setProposeOpen(null) }}
              style={{ padding: '5px 12px', borderRadius: '7px', background: '#8b5cf6', border: 'none', color: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
              Enviar a revisión
            </button>
            <button onClick={() => setProposeOpen(null)}
              style={{ padding: '5px 10px', borderRadius: '7px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        )}

        {/* ─── Panel: rechazar con comentario ───────────────────────────── */}
        {rejectOpen === task.id && (
          <div style={{ padding: '8px 48px', background: 'rgba(239,68,68,0.05)', borderBottom: '1px solid rgba(239,68,68,0.15)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input autoFocus placeholder="Motivo del rechazo (obligatorio)..." value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              style={{ flex: 1, padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'var(--background)', fontSize: '0.8rem', outline: 'none', color: 'var(--foreground)' }} />
            <button disabled={!rejectNote.trim()}
              onClick={async () => { await transition(task.id, 'reject', { comentario: rejectNote }); setRejectOpen(null) }}
              style={{ padding: '5px 12px', borderRadius: '7px', background: '#ef4444', border: 'none', color: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', opacity: rejectNote.trim() ? 1 : 0.4 }}>
              Rechazar
            </button>
            <button onClick={() => setRejectOpen(null)}
              style={{ padding: '5px 10px', borderRadius: '7px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        )}

        {/* ─── Panel: historial ─────────────────────────────────────────── */}
        {showLogs === task.id && (
          <div style={{ padding: '8px 48px 12px', background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Historial</p>
            {logsLoading ? (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cargando…</p>
            ) : logs.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sin registros</p>
            ) : logs.map(log => (
              <div key={log.id} style={{ display: 'flex', gap: '8px', padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: '0.72rem', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 700, color: log.action === 'approve' || log.action === 'aprueba' ? '#22c55e' : log.action === 'reject' || log.action === 'rechaza' ? '#ef4444' : '#8b5cf6', minWidth: '70px' }}>
                  {log.action}
                </span>
                {log.comment && <span style={{ color: 'var(--foreground)', flex: 1 }}>{log.comment}</span>}
                <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {log.user_name} · {new Date(log.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ─── Hijos ────────────────────────────────────────────────────── */}
        {isExpanded && childOf(task.id).map(child => (
          <TaskRow key={child.id} task={child} depth={depth + 1} />
        ))}
      </>
    )
  }

  // ── Render principal ─────────────────────────────────────────────────────────

  if (tasks.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        <p>Sin partidas. Agrega manualmente o importa desde MS Project (XML).</p>
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <Header />
      {roots.map(task => (
        <TaskRow key={task.id} task={task} depth={0} />
      ))}
      {/* Fila para agregar partida raíz */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>
        <button onClick={() => addTask(null, 1)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', background: 'rgba(249,115,22,0.08)', border: '1px dashed rgba(249,115,22,0.3)', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer' }}>
          <Plus size={12} /> Nueva partida
        </button>
      </div>
    </div>
  )
}

// ─── Micro-componentes ────────────────────────────────────────────────────────

function btnStyle(color: string): React.CSSProperties {
  return {
    background: `${color}18`, border: 'none', borderRadius: '4px', cursor: 'pointer',
    color, padding: '2px 4px', display: 'flex', alignItems: 'center', fontSize: '0.7rem',
  }
}

function Btn({ onClick, title, icon, active, danger }: {
  onClick: () => void; title: string; icon: React.ReactNode; active?: boolean; danger?: boolean
}) {
  return (
    <button onClick={onClick} title={title}
      style={{
        background: active ? 'rgba(139,92,246,0.12)' : 'none',
        border: 'none', cursor: 'pointer',
        color: danger ? '#ef4444' : active ? '#8b5cf6' : 'var(--text-muted)',
        padding: '3px', opacity: danger ? 0.5 : 1, display: 'flex', alignItems: 'center',
      }}>
      {icon}
    </button>
  )
}
