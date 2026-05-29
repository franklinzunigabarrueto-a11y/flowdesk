'use client'

import { useState, useRef } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, Trash2, Upload, ChevronRight, ChevronDown,
  FolderOpen, Folder, Check, Calendar, X, Pencil, Save,
} from 'lucide-react'
import { Project, ProjectTask } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

/* ─── MS Project XML parser ─── */
function parseMSProjectXML(xml: string): Omit<ProjectTask, 'id' | 'project_id' | 'created_at' | 'updated_at'>[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const taskEls = Array.from(doc.querySelectorAll('Tasks > Task'))

  return taskEls
    .filter(el => {
      const uid  = el.querySelector('UID')?.textContent
      const name = el.querySelector('Name')?.textContent
      return uid !== '0' && name && name.trim() !== ''
    })
    .map((el, i) => {
      const name    = el.querySelector('Name')?.textContent?.trim() || 'Sin nombre'
      const wbs     = el.querySelector('WBS')?.textContent?.trim() || null
      const level   = parseInt(el.querySelector('OutlineLevel')?.textContent || '1')
      const summary = el.querySelector('Summary')?.textContent === '1'
      const pct     = parseInt(el.querySelector('PercentComplete')?.textContent || '0')
      const startRaw = el.querySelector('Start')?.textContent
      const endRaw   = el.querySelector('Finish')?.textContent

      const parseDate = (s: string | null | undefined) => {
        if (!s) return null
        const d = new Date(s)
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
      }

      return {
        name,
        wbs,
        outline_level: level,
        start_date: parseDate(startRaw),
        end_date:   parseDate(endRaw),
        progress:   Math.min(100, Math.max(0, pct)),
        status: (pct >= 100 ? 'completed' : pct > 0 ? 'in_progress' : 'pending') as ProjectTask['status'],
        is_summary: summary,
        sort_order: i,
        parent_id:  null,
      }
    })
}

export default function ProjectView() {
  const { data: projData, mutate: mutateProjects } = useSWR<{ projects: Project[] }>('/api/projects', fetcher)
  const projects: Project[] = projData?.projects ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjName, setNewProjName] = useState('')
  const [newProjDesc, setNewProjDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const tasksKey = selectedId ? `/api/projects/${selectedId}/tasks` : null
  const { data: tasksData, mutate: mutateTasks } = useSWR<{ tasks: ProjectTask[] }>(tasksKey, fetcher)
  const tasks: ProjectTask[] = tasksData?.tasks ?? []

  const selectedProject = projects.find(p => p.id === selectedId) ?? null

  async function createProject() {
    if (!newProjName.trim()) return
    setSaving(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjName.trim(), description: newProjDesc.trim() }),
    })
    const { project } = await res.json()
    await mutateProjects()
    setSelectedId(project.id)
    setShowNewProject(false)
    setNewProjName('')
    setNewProjDesc('')
    setSaving(false)
  }

  async function deleteProject(id: string) {
    if (!confirm('¿Eliminar este proyecto y todas sus partidas?')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    await mutateProjects()
    if (selectedId === id) setSelectedId(null)
  }

  async function importXML(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedId) return
    setImporting(true)
    setImportError('')
    try {
      const text = await file.text()
      const parsed = parseMSProjectXML(text)
      if (parsed.length === 0) { setImportError('No se encontraron tareas en el archivo XML.'); setImporting(false); return }
      const res = await fetch(`/api/projects/${selectedId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: parsed }),
      })
      if (!res.ok) { setImportError('Error al importar las tareas.'); setImporting(false); return }
      await mutateTasks()
      globalMutate(`/api/projects/${selectedId}/tasks`)
    } catch {
      setImportError('Error al leer el archivo. Asegúrate de exportar como XML desde MS Project.')
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function addTask(parentId: string | null, outlineLevel: number) {
    if (!selectedId) return
    const name = prompt('Nombre de la partida:')
    if (!name?.trim()) return
    await fetch(`/api/projects/${selectedId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), parent_id: parentId, outline_level: outlineLevel, sort_order: tasks.length }),
    })
    await mutateTasks()
  }

  async function deleteTask(taskId: string) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/tasks/${taskId}`, { method: 'DELETE' })
    await mutateTasks()
  }

  async function updateTask(taskId: string, patch: Partial<ProjectTask>) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await mutateTasks()
  }

  /* Build tree from flat list */
  const roots = tasks.filter(t => !t.parent_id).sort((a, b) => a.sort_order - b.sort_order)
  const children = (id: string) => tasks.filter(t => t.parent_id === id).sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Proyectos</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            Gestión de partidas y sub-partidas de obra
          </p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '9px 16px', borderRadius: '10px',
            background: 'var(--primary)', border: 'none',
            color: 'white', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Nuevo proyecto
        </button>
      </div>

      {/* New project form */}
      {showNewProject && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Nuevo proyecto</p>
          <input
            autoFocus
            placeholder="Nombre del proyecto..."
            value={newProjName}
            onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createProject()}
            style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none' }}
          />
          <input
            placeholder="Descripción (opcional)..."
            value={newProjDesc}
            onChange={e => setNewProjDesc(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={createProject} disabled={saving || !newProjName.trim()} style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--primary)', border: 'none', color: 'white', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
              {saving ? 'Creando...' : 'Crear'}
            </button>
            <button onClick={() => { setShowNewProject(false); setNewProjName(''); setNewProjDesc('') }} style={{ padding: '8px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Projects list */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Mis proyectos
            </p>
          </div>
          {projects.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <FolderOpen size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              Sin proyectos aún
            </div>
          ) : projects.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', cursor: 'pointer',
                background: selectedId === p.id ? 'rgba(249,115,22,0.08)' : 'transparent',
                borderLeft: selectedId === p.id ? '3px solid var(--primary)' : '3px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {selectedId === p.id
                ? <FolderOpen size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                : <Folder size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.875rem', fontWeight: selectedId === p.id ? 600 : 400, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedId === p.id ? 'var(--foreground)' : 'var(--text-muted)' }}>
                  {p.name}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteProject(p.id) }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', opacity: 0.5, flexShrink: 0 }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Tasks panel */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {!selectedProject ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Folder size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
              <p style={{ fontSize: '0.95rem' }}>Selecciona un proyecto para ver sus partidas</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{selectedProject.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {tasks.length} partida{tasks.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => addTask(null, 1)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: 'var(--primary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  <Plus size={14} /> Partida
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  <Upload size={14} /> {importing ? 'Importando...' : 'MS Project XML'}
                </button>
                <input ref={fileRef} type="file" accept=".xml" style={{ display: 'none' }} onChange={importXML} />
              </div>

              {importError && (
                <div style={{ padding: '0.75rem 1.25rem', background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <X size={14} /> {importError}
                </div>
              )}

              {/* Task tree */}
              {tasks.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <p>Sin partidas aún.</p>
                  <p style={{ fontSize: '0.82rem', marginTop: '4px' }}>Agrega partidas manualmente o importa desde MS Project (XML).</p>
                </div>
              ) : (
                <div style={{ padding: '0.5rem 0' }}>
                  <TaskHeader />
                  {roots.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      children={children(task.id)}
                      allChildren={children}
                      onUpdate={updateTask}
                      onDelete={deleteTask}
                      onAddChild={id => addTask(id, task.outline_level + 1)}
                      depth={0}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Table header ─── */
function TaskHeader() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 48px 1fr 120px 120px 90px 80px 40px',
      gap: '0', padding: '4px 12px',
      borderBottom: '2px solid var(--border)',
      fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      <div />
      <div>EDT</div>
      <div>Nombre</div>
      <div>Inicio</div>
      <div>Término</div>
      <div>Avance</div>
      <div>Estado</div>
      <div />
    </div>
  )
}

/* ─── Task row (recursive) ─── */
function TaskRow({ task, children, allChildren, onUpdate, onDelete, onAddChild, depth }: {
  task: ProjectTask
  children: ProjectTask[]
  allChildren: (id: string) => ProjectTask[]
  onUpdate: (id: string, patch: Partial<ProjectTask>) => void
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(task.name)

  const hasChildren = children.length > 0
  const isSummary = task.is_summary || hasChildren

  const STATUS_CFG = {
    pending:     { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
    in_progress: { label: 'En curso',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
    completed:   { label: 'Completado',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  }
  const st = STATUS_CFG[task.status]

  function cycleStatus() {
    const next = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' } as const
    const newStatus = next[task.status]
    const patch: Partial<ProjectTask> = { status: newStatus }
    if (newStatus === 'completed') patch.progress = 100
    else if (newStatus === 'pending') patch.progress = 0
    onUpdate(task.id, patch)
  }

  return (
    <>
      <div
        style={{
          display: 'grid', gridTemplateColumns: '28px 48px 1fr 120px 120px 90px 80px 40px',
          gap: '0', padding: '5px 12px', alignItems: 'center',
          background: task.status === 'completed' ? 'rgba(34,197,94,0.04)' : 'transparent',
          borderBottom: '1px solid var(--border)',
          transition: 'background 0.1s',
        }}
      >
        {/* Expand toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasChildren
            ? <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            : null
          }
        </div>

        {/* WBS */}
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {task.wbs || '—'}
        </div>

        {/* Name */}
        <div style={{ paddingLeft: `${depth * 16}px`, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={() => { setEditingName(false); if (nameVal.trim() !== task.name) onUpdate(task.id, { name: nameVal.trim() }) }}
              onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); onUpdate(task.id, { name: nameVal.trim() }) } if (e.key === 'Escape') { setEditingName(false); setNameVal(task.name) } }}
              style={{ flex: 1, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--primary)', background: 'var(--background)', fontSize: '0.82rem', color: 'var(--foreground)', outline: 'none' }}
            />
          ) : (
            <span
              onDoubleClick={() => setEditingName(true)}
              style={{
                fontSize: '0.82rem',
                fontWeight: isSummary ? 600 : 400,
                color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--foreground)',
                textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: 'text', flex: 1,
              }}
              title="Doble clic para editar"
            >
              {task.name}
            </span>
          )}
          <button
            onClick={() => onAddChild(task.id)}
            title="Agregar sub-partida"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px', opacity: 0.5, flexShrink: 0 }}
          >
            <Plus size={11} />
          </button>
        </div>

        {/* Start date */}
        <div>
          <input
            type="date"
            value={task.start_date || ''}
            onChange={e => onUpdate(task.id, { start_date: e.target.value || null })}
            style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '108px', cursor: 'pointer' }}
          />
        </div>

        {/* End date */}
        <div>
          <input
            type="date"
            value={task.end_date || ''}
            onChange={e => onUpdate(task.id, { end_date: e.target.value || null })}
            style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '108px', cursor: 'pointer' }}
          />
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px',
              width: `${task.progress}%`,
              background: task.progress >= 100 ? '#22c55e' : task.progress > 0 ? '#f59e0b' : 'var(--border)',
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0, width: '26px', textAlign: 'right' }}>{task.progress}%</span>
        </div>

        {/* Status badge */}
        <button
          onClick={cycleStatus}
          title="Clic para cambiar estado"
          style={{
            fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: '100px',
            background: st.bg, color: st.color, border: 'none', cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {st.label}
        </button>

        {/* Delete */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => onDelete(task.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '3px', opacity: 0.4 }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Children */}
      {expanded && children.map(child => (
        <TaskRow
          key={child.id}
          task={child}
          children={allChildren(child.id)}
          allChildren={allChildren}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddChild={onAddChild}
          depth={depth + 1}
        />
      ))}
    </>
  )
}
