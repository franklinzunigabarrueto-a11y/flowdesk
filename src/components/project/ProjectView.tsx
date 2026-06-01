'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, Trash2, Upload, FolderOpen, Folder, X,
  BarChart2, Users, Archive, LayoutGrid, Flag,
} from 'lucide-react'
import {
  Project, ProjectTask, ProjectTaskStatus, TaskDependency,
  ProjectResource, TaskAssignment,
} from '@/types'
import ScheduleTable  from './ScheduleTable'
import GanttView      from './GanttView'
import ImportWizard   from './ImportWizard'
import BaselineView   from './BaselineView'
import DashboardView  from './DashboardView'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const pad2 = (n: number) => String(n).padStart(2, '0')

/* ─── Status config ─── */
const S: Record<ProjectTaskStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  in_progress: { label: 'En curso',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  in_review:   { label: 'En revisión', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  approved:    { label: 'Aprobado',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  rejected:    { label: 'Rechazado',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  completed:   { label: 'Completado',  color: '#059669', bg: 'rgba(5,150,105,0.12)'   },
}

/* ─── MS Project XML parser ─── */
function parseMSProjectXML(xml: string): Omit<ProjectTask, 'id'|'project_id'|'created_at'|'updated_at'>[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  return Array.from(doc.querySelectorAll('Tasks > Task'))
    .filter(el => el.querySelector('UID')?.textContent !== '0' && el.querySelector('Name')?.textContent?.trim())
    .map((el, i) => {
      const pct = parseInt(el.querySelector('PercentComplete')?.textContent || '0')
      const parseDate = (s?: string | null) => { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
      return {
        name: el.querySelector('Name')?.textContent?.trim() || 'Sin nombre',
        wbs: el.querySelector('WBS')?.textContent?.trim() || null,
        outline_level: parseInt(el.querySelector('OutlineLevel')?.textContent || '1'),
        start_date: parseDate(el.querySelector('Start')?.textContent),
        end_date: parseDate(el.querySelector('Finish')?.textContent),
        duration_days: Math.ceil(parseInt(el.querySelector('Duration')?.textContent?.replace(/[^0-9]/g,'') || '0') / 600),
        progress: Math.min(100, Math.max(0, pct)),
        progress_proposed: 0,
        status: (pct >= 100 ? 'completed' : pct > 0 ? 'in_progress' : 'pending') as ProjectTaskStatus,
        is_summary: el.querySelector('Summary')?.textContent === '1',
        is_milestone: el.querySelector('Milestone')?.textContent === '1',
        critical_path: false,
        sort_order: i,
        parent_id: null,
        color: null, assignee_name: null,
        proposed_by: null, proposed_at: null, approved_by: null, approved_at: null, rejection_reason: null,
        baseline_start: null, baseline_end: null, baseline_progress: 0,
      }
    })
}

/* ─── CPM: Critical Path Method ─── */
function computeCriticalPath(tasks: ProjectTask[], deps: TaskDependency[]): Set<string> {
  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const dur = (t: ProjectTask) => {
    if (!t.start_date || !t.end_date) return 1
    return Math.max(1, Math.round((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86_400_000))
  }
  const ES = new Map<string, number>(), EF = new Map<string, number>()
  const LS = new Map<string, number>(), LF = new Map<string, number>()
  const inEdges = new Map<string, string[]>(), outEdges = new Map<string, string[]>()
  tasks.forEach(t => { inEdges.set(t.id, []); outEdges.set(t.id, []) })
  deps.forEach(d => { inEdges.get(d.successor_id)?.push(d.predecessor_id); outEdges.get(d.predecessor_id)?.push(d.successor_id) })
  const visited = new Set<string>(), order: string[] = []
  const visit = (id: string) => { if (visited.has(id)) return; visited.add(id); outEdges.get(id)?.forEach(visit); order.unshift(id) }
  tasks.forEach(t => visit(t.id))
  order.forEach(id => {
    const preds = inEdges.get(id) ?? []
    const es = preds.length ? Math.max(...preds.map(p => EF.get(p) ?? 0)) : 0
    ES.set(id, es); EF.set(id, es + dur(taskMap.get(id)!))
  })
  const projectEnd = Math.max(...Array.from(EF.values()))
  ;[...order].reverse().forEach(id => {
    const succs = outEdges.get(id) ?? []
    const lf = succs.length ? Math.min(...succs.map(s => LS.get(s) ?? projectEnd)) : projectEnd
    LF.set(id, lf); LS.set(id, lf - dur(taskMap.get(id)!))
  })
  return new Set(tasks.filter(t => (LS.get(t.id) ?? 0) === (ES.get(t.id) ?? 0)).map(t => t.id))
}

/* ─── Main component ─── */
type Tab = 'cronograma' | 'gantt' | 'recursos' | 'baseline' | 'dashboard'

export default function ProjectView() {
  const { data: projData, mutate: mutateProjects } = useSWR<{ projects: Project[] }>('/api/projects', fetcher)
  const projects: Project[] = projData?.projects ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('cronograma')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjName, setNewProjName] = useState('')
  const [newProjDesc, setNewProjDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const tasksKey = selectedId ? `/api/projects/${selectedId}/tasks` : null
  const { data: tasksData, mutate: mutateTasks } = useSWR<{ tasks: ProjectTask[]; isAdmin: boolean }>(tasksKey, fetcher)
  const tasks: ProjectTask[] = tasksData?.tasks ?? []
  const isAdmin = tasksData?.isAdmin ?? true

  const depsKey = selectedId ? `/api/projects/${selectedId}/dependencies` : null
  const { data: depsData, mutate: mutateDeps } = useSWR<{ dependencies: TaskDependency[] }>(depsKey, fetcher)
  const deps: TaskDependency[] = depsData?.dependencies ?? []

  const resourcesKey = selectedId ? `/api/projects/${selectedId}/resources` : null
  const { data: resourcesData, mutate: mutateResources } = useSWR<{ resources: ProjectResource[] }>(resourcesKey, fetcher)
  const resources: ProjectResource[] = resourcesData?.resources ?? []

  const assignmentsKey = selectedId ? `/api/projects/${selectedId}/assignments` : null
  const { data: assignmentsData, mutate: mutateAssignments } = useSWR<{ assignments: (TaskAssignment & { resource: ProjectResource; task: { name: string; wbs: string } })[] }>(assignmentsKey, fetcher)
  const assignments = assignmentsData?.assignments ?? []

  const selectedProject = projects.find(p => p.id === selectedId) ?? null
  const criticalIds = tasks.length && deps.length ? computeCriticalPath(tasks, deps) : new Set<string>()

  async function createProject() {
    if (!newProjName.trim()) return
    setSaving(true)
    const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newProjName.trim(), description: newProjDesc.trim() }) })
    const { project } = await res.json()
    await mutateProjects()
    setSelectedId(project.id)
    setShowNewProject(false); setNewProjName(''); setNewProjDesc('')
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
    setImporting(true); setImportError('')
    try {
      const parsed = parseMSProjectXML(await file.text())
      if (!parsed.length) { setImportError('No se encontraron tareas.'); setImporting(false); return }
      const res = await fetch(`/api/projects/${selectedId}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: parsed }) })
      if (!res.ok) { setImportError('Error al importar.'); setImporting(false); return }
      await mutateTasks()
    } catch { setImportError('Error al leer el archivo XML.') }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function addTask(parentId: string | null, outlineLevel: number) {
    if (!selectedId) return
    const name = prompt('Nombre de la partida:')
    if (!name?.trim()) return
    await fetch(`/api/projects/${selectedId}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), parent_id: parentId, outline_level: outlineLevel, sort_order: tasks.length }) })
    await mutateTasks()
  }

  async function deleteTask(taskId: string) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/tasks/${taskId}`, { method: 'DELETE' })
    await mutateTasks()
  }

  async function updateTask(taskId: string, patch: Partial<ProjectTask>) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    await mutateTasks()
  }

  async function approveTask(taskId: string, action: 'approve' | 'reject', comment?: string) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/tasks/${taskId}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment }) })
    await mutateTasks()
  }

  async function proposeProgress(taskId: string, progress: number, comment?: string) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/tasks/${taskId}/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ progress, comment }) })
    await mutateTasks()
  }

  async function addDep(predecessorId: string, successorId: string, type = 'FS', lag = 0) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/dependencies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ predecessor_id: predecessorId, successor_id: successorId, type, lag_days: lag }) })
    await mutateDeps()
  }

  async function removeDep(depId: string) {
    if (!selectedId) return
    await fetch(`/api/projects/${selectedId}/dependencies?dep_id=${depId}`, { method: 'DELETE' })
    await mutateDeps()
  }

  const roots = tasks.filter(t => !t.parent_id).sort((a, b) => a.sort_order - b.sort_order)
  const children = (id: string) => tasks.filter(t => t.parent_id === id).sort((a, b) => a.sort_order - b.sort_order)

  const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'cronograma', icon: <LayoutGrid size={15} />, label: 'Cronograma' },
    { id: 'gantt',      icon: <BarChart2 size={15} />, label: 'Gantt' },
    { id: 'recursos',   icon: <Users size={15} />,     label: 'Recursos' },
    { id: 'baseline',   icon: <Archive size={15} />,   label: 'Línea Base' },
    { id: 'dashboard',  icon: <Flag size={15} />,      label: 'Dashboard' },
  ]

  return (
    <div style={{ padding: '1.5rem 2rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Import wizard */}
      {showImportWizard && selectedId && (
        <ImportWizard
          projectId={selectedId}
          onClose={() => setShowImportWizard(false)}
          onSuccess={() => { setShowImportWizard(false); mutateTasks() }}
        />
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Proyectos</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>Planificación tipo MS Project</p>
        </div>
        <button onClick={() => setShowNewProject(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '10px', background: 'var(--primary)', border: 'none', color: 'white', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
          <Plus size={16} /> Nuevo proyecto
        </button>
      </div>

      {/* New project form */}
      {showNewProject && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.25rem', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Nuevo proyecto</p>
          <input autoFocus placeholder="Nombre del proyecto..." value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProject()} style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none' }} />
          <input placeholder="Descripción (opcional)..." value={newProjDesc} onChange={e => setNewProjDesc(e.target.value)} style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={createProject} disabled={saving || !newProjName.trim()} style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--primary)', border: 'none', color: 'white', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>{saving ? 'Creando...' : 'Crear'}</button>
            <button onClick={() => { setShowNewProject(false); setNewProjName(''); setNewProjDesc('') }} style={{ padding: '8px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Project tabs */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
          {projects.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={() => { setSelectedId(p.id); setTab('cronograma') }} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 14px', borderRadius: '10px', cursor: 'pointer', border: selectedId === p.id ? '1.5px solid var(--primary)' : '1.5px solid var(--border)', background: selectedId === p.id ? 'rgba(249,115,22,0.08)' : 'var(--surface)', color: selectedId === p.id ? 'var(--primary)' : 'var(--text-muted)', fontWeight: selectedId === p.id ? 700 : 500, fontSize: '0.85rem', transition: 'all 0.15s' }}>
                {selectedId === p.id ? <FolderOpen size={14} /> : <Folder size={14} />}{p.name}
              </button>
              <button onClick={() => deleteProject(p.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', opacity: 0.4 }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Main panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!selectedProject ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Folder size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
            <p>{projects.length === 0 ? 'Crea un proyecto para comenzar' : 'Selecciona un proyecto'}</p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Module tabs */}
              <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: tab === t.id ? 700 : 500, background: tab === t.id ? 'var(--primary)' : 'transparent', color: tab === t.id ? 'white' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
              {/* Actions */}
              {tab === 'cronograma' && (
                <>
                  <button onClick={() => setShowImportWizard(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                    <Upload size={13} /> Importar
                  </button>
                  <a href={selectedId ? `/api/projects/${selectedId}/export/csv` : '#'}
                    download style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#16a34a', fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none' }}>
                    ↓ CSV
                  </a>
                </>
              )}
            </div>

            {importError && <div style={{ padding: '0.6rem 1.25rem', background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}><X size={14} />{importError}</div>}

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {tab === 'cronograma' && (
                <ScheduleTable projectId={selectedId!} />
              )}
              {tab === 'gantt' && (
                <GanttView projectId={selectedId!} />
              )}
              {tab === 'recursos' && (
                <RecursosTab
                  projectId={selectedId!} resources={resources} assignments={assignments} tasks={tasks}
                  onMutateResources={mutateResources} onMutateAssignments={mutateAssignments}
                />
              )}
              {tab === 'baseline' && (
                <BaselineView projectId={selectedId!} />
              )}
              {tab === 'dashboard' && (
                <DashboardView projectId={selectedId!} project={selectedProject} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════
   TAB 3: RECURSOS
══════════════════════════════════ */
function RecursosTab({ projectId, resources, assignments, tasks, onMutateResources, onMutateAssignments }: { projectId: string; resources: ProjectResource[]; assignments: any[]; tasks: ProjectTask[]; onMutateResources: () => void; onMutateAssignments: () => void }) {
  const [newRes, setNewRes] = useState({ name: '', type: 'person' as const, cost_per_unit: 0, unit: 'hr' })
  const [addAssign, setAddAssign] = useState({ task_id: '', resource_id: '', units: 1 })
  const TIPOS = { person: '👤 Persona', equipment: '🔧 Equipo', material: '📦 Material' }

  async function createResource() {
    if (!newRes.name.trim()) return
    await fetch(`/api/projects/${projectId}/resources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newRes) })
    setNewRes({ name: '', type: 'person', cost_per_unit: 0, unit: 'hr' })
    onMutateResources()
  }

  async function deleteResource(id: string) {
    await fetch(`/api/projects/${projectId}/resources?resource_id=${id}`, { method: 'DELETE' })
    onMutateResources()
  }

  async function createAssignment() {
    if (!addAssign.task_id || !addAssign.resource_id) return
    await fetch(`/api/projects/${projectId}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addAssign) })
    setAddAssign({ task_id: '', resource_id: '', units: 1 })
    onMutateAssignments()
  }

  async function deleteAssignment(id: string) {
    await fetch(`/api/projects/${projectId}/assignments?assignment_id=${id}`, { method: 'DELETE' })
    onMutateAssignments()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, flex: 1, overflow: 'hidden' }}>
      {/* Resources list */}
      <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0 }}>Recursos del proyecto</p>
        </div>
        {/* Add resource form */}
        <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input placeholder="Nombre del recurso" value={newRes.name} onChange={e => setNewRes(p => ({ ...p, name: e.target.value }))} style={{ flex: 1, padding: '5px 8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.78rem', outline: 'none', color: 'var(--foreground)' }} />
            <select value={newRes.type} onChange={e => setNewRes(p => ({ ...p, type: e.target.value as any }))} style={{ padding: '5px 6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.72rem', color: 'var(--foreground)' }}>
              <option value="person">Persona</option>
              <option value="equipment">Equipo</option>
              <option value="material">Material</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="number" placeholder="Costo/unidad" value={newRes.cost_per_unit || ''} onChange={e => setNewRes(p => ({ ...p, cost_per_unit: Number(e.target.value) }))} style={{ width: '110px', padding: '5px 8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.78rem', outline: 'none', color: 'var(--foreground)' }} />
            <input placeholder="Unidad (hr, día…)" value={newRes.unit} onChange={e => setNewRes(p => ({ ...p, unit: e.target.value }))} style={{ flex: 1, padding: '5px 8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.78rem', outline: 'none', color: 'var(--foreground)' }} />
            <button onClick={createResource} disabled={!newRes.name.trim()} style={{ padding: '5px 12px', borderRadius: '7px', background: 'var(--primary)', border: 'none', color: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>+ Agregar</button>
          </div>
        </div>
        {/* Resource rows */}
        {resources.length === 0 ? <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin recursos</p> : resources.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.9rem' }}>{TIPOS[r.type]?.slice(0, 2)}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>{r.name}</p>
              <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{r.cost_per_unit.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}/{r.unit}</p>
            </div>
            <button onClick={() => deleteResource(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', opacity: 0.5 }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {/* Assignments */}
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0 }}>Asignaciones</p>
        </div>
        {/* Add assignment */}
        <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <select value={addAssign.task_id} onChange={e => setAddAssign(p => ({ ...p, task_id: e.target.value }))} style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.72rem', color: 'var(--foreground)' }}>
            <option value="">Selecciona tarea...</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.wbs ? `${t.wbs} ` : ''}{t.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select value={addAssign.resource_id} onChange={e => setAddAssign(p => ({ ...p, resource_id: e.target.value }))} style={{ flex: 1, padding: '5px 6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.72rem', color: 'var(--foreground)' }}>
              <option value="">Recurso...</option>
              {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input type="number" min={0.1} step={0.1} value={addAssign.units} onChange={e => setAddAssign(p => ({ ...p, units: Number(e.target.value) }))} style={{ width: '60px', padding: '5px 6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.72rem', outline: 'none' }} />
            <button onClick={createAssignment} disabled={!addAssign.task_id || !addAssign.resource_id} style={{ padding: '5px 12px', borderRadius: '7px', background: 'var(--primary)', border: 'none', color: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>+ Asignar</button>
          </div>
        </div>
        {assignments.length === 0 ? <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin asignaciones</p> : assignments.map((a: any) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600 }}>{a.task?.wbs ? `${a.task.wbs} ` : ''}{a.task?.name}</p>
              <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{a.resource?.name} · {a.units} {a.resource?.unit}</p>
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600 }}>{(a.total_cost || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</p>
            <button onClick={() => deleteAssignment(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', opacity: 0.5 }}><Trash2 size={13} /></button>
          </div>
        ))}
        {assignments.length > 0 && (
          <div style={{ padding: '8px 12px', background: 'var(--surface-hover)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)' }}>
              Total: {assignments.reduce((s: number, a: any) => s + (a.total_cost || 0), 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
