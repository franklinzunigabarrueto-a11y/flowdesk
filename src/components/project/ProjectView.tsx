'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, Trash2, Upload, ChevronRight, ChevronDown,
  FolderOpen, Folder, X, Pencil, Save, Check, AlertCircle,
  Clock, Link, BarChart2, Users, Archive, LayoutGrid,
  Flag, GitBranch, CheckCircle, XCircle, History, RefreshCw,
} from 'lucide-react'
import {
  Project, ProjectTask, ProjectTaskStatus, TaskDependency,
  ApprovalLog, ProjectResource, TaskAssignment, ProjectBaseline,
} from '@/types'
import ScheduleTable from './ScheduleTable'
import GanttView     from './GanttView'
import ImportWizard  from './ImportWizard'

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

  const baselinesKey = selectedId ? `/api/projects/${selectedId}/baselines` : null
  const { data: baselinesData, mutate: mutateBaselines } = useSWR<{ baselines: ProjectBaseline[] }>(baselinesKey, fetcher)
  const baselines: ProjectBaseline[] = baselinesData?.baselines ?? []

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
                <BaselineTab projectId={selectedId!} baselines={baselines} tasks={tasks} onMutate={mutateBaselines} onMutateTasks={mutateTasks} />
              )}
              {tab === 'dashboard' && (
                <DashboardTab tasks={tasks} deps={deps} criticalIds={criticalIds} project={selectedProject} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════
   TAB 1: CRONOGRAMA
══════════════════════════════════ */
function CronogramaTab({ tasks, roots, children, deps, isAdmin, criticalIds, onUpdate, onDelete, onAddChild, onApprove, onPropose, onAddDep, onRemoveDep, projectId }: {
  tasks: ProjectTask[]; roots: ProjectTask[]; children: (id: string) => ProjectTask[]
  deps: TaskDependency[]; isAdmin: boolean; criticalIds: Set<string>
  onUpdate: (id: string, p: Partial<ProjectTask>) => void
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
  onApprove: (id: string, action: 'approve' | 'reject', comment?: string) => void
  onPropose: (id: string, progress: number, comment?: string) => void
  onAddDep: (pred: string, succ: string, type?: string, lag?: number) => void
  onRemoveDep: (depId: string) => void
  projectId: string
}) {
  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {tasks.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <p>Sin partidas aún. Agrega manualmente o importa desde MS Project (XML).</p>
        </div>
      ) : (
        <>
          <CronogramaHeader />
          {roots.map(task => (
            <CronogramaRow
              key={task.id} task={task} children={children(task.id)} allChildren={children}
              deps={deps} isAdmin={isAdmin} criticalIds={criticalIds}
              onUpdate={onUpdate} onDelete={onDelete} onAddChild={onAddChild}
              onApprove={onApprove} onPropose={onPropose}
              onAddDep={onAddDep} onRemoveDep={onRemoveDep}
              tasks={tasks} depth={0} projectId={projectId}
            />
          ))}
        </>
      )}
    </div>
  )
}

function CronogramaHeader() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 44px 1fr 110px 110px 80px 80px 100px 90px 48px', gap: 0, padding: '4px 12px', borderBottom: '2px solid var(--border)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-hover)' }}>
      <div /><div>EDT</div><div>Nombre</div><div>Inicio</div><div>Término</div><div>Propuesto</div><div>Aprobado</div><div>Estado</div><div>Responsable</div><div />
    </div>
  )
}

function CronogramaRow({ task, children, allChildren, deps, isAdmin, criticalIds, onUpdate, onDelete, onAddChild, onApprove, onPropose, onAddDep, onRemoveDep, tasks, depth, projectId }: {
  task: ProjectTask; children: ProjectTask[]; allChildren: (id: string) => ProjectTask[]
  deps: TaskDependency[]; isAdmin: boolean; criticalIds: Set<string>
  onUpdate: (id: string, p: Partial<ProjectTask>) => void
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
  onApprove: (id: string, action: 'approve'|'reject', comment?: string) => void
  onPropose: (id: string, progress: number, comment?: string) => void
  onAddDep: (pred: string, succ: string, type?: string, lag?: number) => void
  onRemoveDep: (depId: string) => void
  tasks: ProjectTask[]; depth: number; projectId: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(task.name)
  const [showLogs, setShowLogs] = useState(false)
  const [showDeps, setShowDeps] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  const [proposeVal, setProposeVal] = useState(task.progress_proposed)
  const [showProposeInput, setShowProposeInput] = useState(false)
  const [logs, setLogs] = useState<ApprovalLog[]>([])

  const hasChildren = children.length > 0
  const isSummary = task.is_summary || hasChildren
  const isCritical = criticalIds.has(task.id)
  const st = S[task.status]
  const taskDeps = deps.filter(d => d.successor_id === task.id)
  const getPredWbs = (predId: string) => tasks.find(t => t.id === predId)?.wbs || predId.slice(0, 6)

  async function loadLogs() {
    const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}/logs`)
    const data = await res.json()
    setLogs(data.logs ?? [])
  }

  function cycleStatus() {
    if (task.status === 'in_review' || task.status === 'rejected') return
    const next: Record<string, ProjectTaskStatus> = { pending: 'in_progress', in_progress: 'in_progress', approved: 'completed', completed: 'pending' }
    const ns = next[task.status] || 'in_progress'
    onUpdate(task.id, { status: ns, progress: ns === 'completed' ? 100 : ns === 'pending' ? 0 : task.progress })
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '24px 44px 1fr 110px 110px 80px 80px 100px 90px 48px', gap: 0, padding: '4px 12px', alignItems: 'center', borderBottom: '1px solid var(--border)', background: isCritical ? 'rgba(239,68,68,0.03)' : task.status === 'completed' ? 'rgba(34,197,94,0.03)' : 'transparent', borderLeft: isCritical ? '3px solid rgba(239,68,68,0.5)' : '3px solid transparent', transition: 'background 0.1s' }}>
        {/* Expand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasChildren ? <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : null}
        </div>

        {/* WBS */}
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '3px' }}>
          {task.is_milestone && <Flag size={9} color="#f59e0b" />}
          {isCritical && <AlertCircle size={9} color="#ef4444" />}
          {task.wbs || '—'}
        </div>

        {/* Name */}
        <div style={{ paddingLeft: `${depth * 14}px`, display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
          {editingName ? (
            <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)} onBlur={() => { setEditingName(false); if (nameVal.trim() !== task.name) onUpdate(task.id, { name: nameVal.trim() }) }} onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); onUpdate(task.id, { name: nameVal.trim() }) } if (e.key === 'Escape') { setEditingName(false); setNameVal(task.name) } }} style={{ flex: 1, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--primary)', background: 'var(--background)', fontSize: '0.8rem', outline: 'none' }} />
          ) : (
            <span onDoubleClick={() => setEditingName(true)} style={{ fontSize: '0.8rem', fontWeight: isSummary ? 600 : 400, color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--foreground)', textDecoration: task.status === 'completed' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1 }} title="Doble clic para editar">
              {task.name}
            </span>
          )}
          {/* Dep badge */}
          {taskDeps.length > 0 && <span onClick={() => setShowDeps(s => !s)} style={{ fontSize: '0.6rem', color: '#8b5cf6', cursor: 'pointer', flexShrink: 0 }} title="Dependencias"><GitBranch size={10} />{taskDeps.map(d => getPredWbs(d.predecessor_id)).join(',')}</span>}
          <button onClick={() => onAddChild(task.id)} title="Sub-partida" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', opacity: 0.5, flexShrink: 0 }}><Plus size={10} /></button>
        </div>

        {/* Start */}
        <div><input type="date" value={task.start_date || ''} onChange={e => onUpdate(task.id, { start_date: e.target.value || null })} style={{ fontSize: '0.72rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '100px' }} /></div>

        {/* End */}
        <div><input type="date" value={task.end_date || ''} onChange={e => onUpdate(task.id, { end_date: e.target.value || null })} style={{ fontSize: '0.72rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '100px' }} /></div>

        {/* Proposed % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {showProposeInput ? (
            <input type="number" min={0} max={100} value={proposeVal} onChange={e => setProposeVal(Number(e.target.value))} onBlur={() => setShowProposeInput(false)} onKeyDown={e => { if (e.key === 'Enter') { setShowProposeInput(false); onPropose(task.id, proposeVal) } }} autoFocus style={{ width: '52px', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--primary)', background: 'var(--background)', fontSize: '0.72rem', outline: 'none' }} />
          ) : (
            <button onClick={() => { setProposeVal(task.progress_proposed); setShowProposeInput(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-muted)', fontSize: '0.72rem', padding: '2px' }}>
              <div style={{ width: '32px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${task.progress_proposed}%`, background: '#8b5cf6' }} /></div>
              {task.progress_proposed}%
            </button>
          )}
          {task.status === 'in_progress' && <button onClick={() => onPropose(task.id, proposeVal)} title="Enviar a revisión" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b5cf6', padding: '2px' }}><GitBranch size={11} /></button>}
        </div>

        {/* Approved % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <div style={{ width: '32px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${task.progress}%`, background: task.progress >= 100 ? '#059669' : '#22c55e' }} /></div>
          {task.progress}%
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={cycleStatus} style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: '100px', background: st.bg, color: st.color, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>{st.label}</button>
          {task.status === 'in_review' && isAdmin && (
            <>
              <button onClick={() => onApprove(task.id, 'approve')} title="Aprobar" style={{ background: 'rgba(34,197,94,0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#22c55e', padding: '2px 4px', display: 'flex', alignItems: 'center' }}><CheckCircle size={12} /></button>
              <button onClick={() => setShowReject(true)} title="Rechazar" style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#ef4444', padding: '2px 4px', display: 'flex', alignItems: 'center' }}><XCircle size={12} /></button>
            </>
          )}
          {task.status === 'rejected' && <button onClick={() => onUpdate(task.id, { status: 'in_progress' })} title="Reintentrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', padding: '2px' }}><RefreshCw size={11} /></button>}
        </div>

        {/* Assignee */}
        <div>
          <input value={task.assignee_name || ''} onChange={e => onUpdate(task.id, { assignee_name: e.target.value })} placeholder="Responsable" style={{ fontSize: '0.72rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', width: '84px', outline: 'none' }} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowLogs(s => !s); if (!showLogs) loadLogs() }} title="Historial" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px', opacity: 0.6 }}><History size={12} /></button>
          <button onClick={() => setShowDeps(s => !s)} title="Dependencias" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px', opacity: 0.6 }}><Link size={12} /></button>
          <button onClick={() => onDelete(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px', opacity: 0.4 }}><Trash2 size={12} /></button>
        </div>
      </div>

      {/* Reject comment panel */}
      {showReject && (
        <div style={{ padding: '8px 48px', background: 'rgba(239,68,68,0.05)', borderBottom: '1px solid rgba(239,68,68,0.15)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input autoFocus placeholder="Motivo del rechazo..." value={rejectComment} onChange={e => setRejectComment(e.target.value)} style={{ flex: 1, padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'var(--background)', fontSize: '0.8rem', outline: 'none', color: 'var(--foreground)' }} />
          <button onClick={() => { onApprove(task.id, 'reject', rejectComment); setShowReject(false); setRejectComment('') }} style={{ padding: '5px 12px', borderRadius: '7px', background: '#ef4444', border: 'none', color: 'white', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Rechazar</button>
          <button onClick={() => setShowReject(false)} style={{ padding: '5px 10px', borderRadius: '7px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>Cancelar</button>
        </div>
      )}

      {/* Logs panel */}
      {showLogs && (
        <div style={{ padding: '8px 48px 12px', background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Historial de aprobaciones</p>
          {logs.length === 0 ? <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sin registros</p> : logs.map(log => (
            <div key={log.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '0.72rem' }}>
              <span style={{ color: log.action === 'approve' ? '#22c55e' : log.action === 'reject' ? '#ef4444' : '#8b5cf6', fontWeight: 700, minWidth: '70px' }}>{log.action === 'propose' ? 'Propuesto' : log.action === 'approve' ? 'Aprobado' : log.action === 'reject' ? 'Rechazado' : 'Reset'}</span>
              {log.progress_value != null && <span style={{ color: 'var(--text-muted)' }}>{log.progress_value}%</span>}
              {log.comment && <span style={{ color: 'var(--foreground)' }}>{log.comment}</span>}
              <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{new Date(log.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Deps panel */}
      {showDeps && (
        <DepPanel task={task} tasks={tasks} deps={deps} onAddDep={onAddDep} onRemoveDep={onRemoveDep} />
      )}

      {/* Children */}
      {expanded && children.map(child => (
        <CronogramaRow key={child.id} task={child} children={allChildren(child.id)} allChildren={allChildren} deps={deps} isAdmin={isAdmin} criticalIds={criticalIds} onUpdate={onUpdate} onDelete={onDelete} onAddChild={onAddChild} onApprove={onApprove} onPropose={onPropose} onAddDep={onAddDep} onRemoveDep={onRemoveDep} tasks={tasks} depth={depth + 1} projectId={projectId} />
      ))}
    </>
  )
}

function DepPanel({ task, tasks, deps, onAddDep, onRemoveDep }: { task: ProjectTask; tasks: ProjectTask[]; deps: TaskDependency[]; onAddDep: (a: string, b: string, t?: string, l?: number) => void; onRemoveDep: (id: string) => void }) {
  const [selPred, setSelPred] = useState('')
  const [selType, setSelType] = useState('FS')
  const [lag, setLag] = useState(0)
  const taskDeps = deps.filter(d => d.successor_id === task.id)
  const others = tasks.filter(t => t.id !== task.id)
  return (
    <div style={{ padding: '8px 48px 12px', background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid var(--border)' }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dependencias (predecesoras)</p>
      {taskDeps.map(d => {
        const pred = tasks.find(t => t.id === d.predecessor_id)
        return (
          <div key={d.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0', fontSize: '0.72rem' }}>
            <span style={{ color: '#8b5cf6', fontFamily: 'monospace' }}>{pred?.wbs || d.predecessor_id.slice(0, 6)}</span>
            <span style={{ color: 'var(--foreground)' }}>{pred?.name}</span>
            <span style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', padding: '1px 5px', borderRadius: '4px' }}>{d.type}</span>
            {d.lag_days !== 0 && <span style={{ color: 'var(--text-muted)' }}>{d.lag_days > 0 ? `+${d.lag_days}d` : `${d.lag_days}d`}</span>}
            <button onClick={() => onRemoveDep(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', marginLeft: 'auto' }}><X size={11} /></button>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
        <select value={selPred} onChange={e => setSelPred(e.target.value)} style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.72rem', flex: 1 }}>
          <option value="">Predecesora...</option>
          {others.map(t => <option key={t.id} value={t.id}>{t.wbs ? `${t.wbs} - ` : ''}{t.name}</option>)}
        </select>
        <select value={selType} onChange={e => setSelType(e.target.value)} style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.72rem' }}>
          {['FS','SS','FF','SF'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="number" value={lag} onChange={e => setLag(Number(e.target.value))} placeholder="Lag" style={{ width: '48px', padding: '3px 4px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.72rem', outline: 'none' }} />
        <button onClick={() => { if (selPred) { onAddDep(selPred, task.id, selType, lag); setSelPred('') } }} disabled={!selPred} style={{ padding: '4px 10px', borderRadius: '5px', background: '#8b5cf6', border: 'none', color: 'white', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>+ Agregar</button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════
   TAB 2: GANTT
══════════════════════════════════ */
const DAY_PX = 26
const ROW_H  = 34
const LEFT_W = 260
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function toDate(s?: string | null): Date | null { if (!s) return null; const d = new Date(s + 'T12:00:00'); return isNaN(d.getTime()) ? null : d }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86_400_000) }

function GanttTab({ tasks, deps, criticalIds, onUpdate, projectId }: { tasks: ProjectTask[]; deps: TaskDependency[]; criticalIds: Set<string>; onUpdate: (id: string, p: Partial<ProjectTask>) => void; projectId: string }) {
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
  const today = new Date()
  const allDates = sorted.flatMap(t => [toDate(t.start_date), toDate(t.end_date)].filter(Boolean) as Date[])
  const rangeStart = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date(today.getFullYear(), today.getMonth(), 1)
  const rangeEnd   = allDates.length ? new Date(Math.max(...allDates.map(d => d.getTime()))) : new Date(today.getFullYear(), today.getMonth() + 3, 0)
  rangeStart.setDate(rangeStart.getDate() - 7)
  rangeEnd.setDate(rangeEnd.getDate() + 14)
  const totalDays  = daysBetween(rangeStart, rangeEnd)
  const totalWidth = totalDays * DAY_PX
  const todayOff   = daysBetween(rangeStart, today) * DAY_PX

  const monthHeaders: { label: string; days: number }[] = []
  let cursor = new Date(rangeStart)
  while (cursor < rangeEnd) {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const monthEnd = new Date(y, m + 1, 1)
    const end = monthEnd < rangeEnd ? monthEnd : rangeEnd
    monthHeaders.push({ label: `${MONTHS_SHORT[m]} ${y}`, days: daysBetween(cursor, end) })
    cursor = monthEnd
  }

  const [dragState, setDragState] = useState<{ taskId: string; mode: 'move'|'left'|'right'; startX: number; origStart: Date|null; origEnd: Date|null } | null>(null)
  const [liveDates, setLiveDates] = useState<Map<string, { start: Date|null; end: Date|null }>>(new Map())

  useEffect(() => {
    if (!dragState) return
    const onMove = (e: MouseEvent) => {
      const delta = Math.round((e.clientX - dragState.startX) / DAY_PX)
      const { taskId, mode, origStart, origEnd } = dragState
      const newDates = new Map(liveDates)
      if (mode === 'move') {
        const ns = origStart ? new Date(origStart) : null
        const ne = origEnd   ? new Date(origEnd)   : null
        ns?.setDate(ns.getDate() + delta)
        ne?.setDate(ne.getDate() + delta)
        newDates.set(taskId, { start: ns, end: ne })
      } else if (mode === 'left') {
        const ns = origStart ? new Date(origStart) : null
        ns?.setDate(ns.getDate() + delta)
        if (!ns || !origEnd || ns < origEnd) newDates.set(taskId, { start: ns, end: origEnd })
      } else {
        const ne = origEnd ? new Date(origEnd) : null
        ne?.setDate(ne.getDate() + delta)
        if (!ne || !origStart || ne > origStart) newDates.set(taskId, { start: origStart, end: ne })
      }
      setLiveDates(newDates)
    }
    const onUp = () => {
      const ld = liveDates.get(dragState.taskId)
      if (ld) {
        const patch: Partial<ProjectTask> = {}
        if (ld.start) patch.start_date = ld.start.toISOString().slice(0, 10)
        if (ld.end)   patch.end_date   = ld.end.toISOString().slice(0, 10)
        onUpdate(dragState.taskId, patch)
      }
      setDragState(null)
      setLiveDates(new Map())
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragState, liveDates, onUpdate])

  const startDrag = (e: React.MouseEvent, task: ProjectTask, mode: 'move'|'left'|'right') => {
    e.preventDefault(); e.stopPropagation()
    setDragState({ taskId: task.id, mode, startX: e.clientX, origStart: toDate(task.start_date), origEnd: toDate(task.end_date) })
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, userSelect: 'none' }}>
      {/* Legend */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        {Object.entries(S).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: v.color }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{v.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', border: '2px solid #ef4444', background: 'transparent' }} />
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Ruta crítica</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(148,163,184,0.25)', border: '1px dashed #94a3b8' }} />
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Línea base</span>
        </div>
      </div>

      {/* Gantt body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', display: 'flex' }}>
        {/* Left: names */}
        <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 3 }}>
          <div style={{ height: ROW_H * 2, borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'flex-end', padding: '0 10px 6px' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Partida</span>
          </div>
          {sorted.map(task => (
            <div key={task.id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', paddingLeft: `${8 + (task.outline_level - 1) * 12}px`, paddingRight: '8px', borderBottom: '1px solid var(--border)', background: criticalIds.has(task.id) ? 'rgba(239,68,68,0.03)' : 'transparent' }}>
              {task.is_milestone ? <Flag size={10} color="#f59e0b" style={{ marginRight: '4px', flexShrink: 0 }} /> : null}
              <span style={{ fontSize: '0.74rem', fontWeight: task.is_summary ? 600 : 400, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.wbs ? <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.65rem', marginRight: '5px' }}>{task.wbs}</span> : null}
                {task.name}
              </span>
            </div>
          ))}
        </div>

        {/* Right: timeline */}
        <div style={{ flex: 1, overflowX: 'visible', position: 'relative' }}>
          <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>
            {/* Month header */}
            <div style={{ height: ROW_H, display: 'flex', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>
              {monthHeaders.map((mh, i) => (
                <div key={i} style={{ width: mh.days * DAY_PX, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: '6px', borderRight: '1px solid var(--border)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground)' }}>{mh.label}</div>
              ))}
            </div>
            {/* Day header */}
            <div style={{ height: ROW_H, display: 'flex', borderBottom: '2px solid var(--border)', position: 'sticky', top: ROW_H, background: 'var(--surface)', zIndex: 2 }}>
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(rangeStart); d.setDate(d.getDate() + i)
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                const isToday = daysBetween(rangeStart, d) === daysBetween(rangeStart, today)
                return <div key={i} style={{ width: DAY_PX, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--primary)' : isWeekend ? 'rgba(239,68,68,0.55)' : 'var(--text-muted)', background: isWeekend ? 'rgba(239,68,68,0.03)' : 'transparent', borderRight: '1px solid var(--border)' }}>{d.getDate()}</div>
              })}
            </div>

            {/* Rows */}
            <div style={{ position: 'relative' }}>
              {/* Today line */}
              {todayOff >= 0 && todayOff <= totalWidth && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayOff + DAY_PX / 2, width: 2, background: '#ef4444', zIndex: 2, pointerEvents: 'none' }} />
              )}

              {/* Dependency arrows SVG */}
              <svg style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: sorted.length * ROW_H, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}>
                {deps.map(dep => {
                  const predIdx = sorted.findIndex(t => t.id === dep.predecessor_id)
                  const succIdx = sorted.findIndex(t => t.id === dep.successor_id)
                  if (predIdx < 0 || succIdx < 0) return null
                  const pred = sorted[predIdx], succ = sorted[succIdx]
                  const predEnd = toDate(pred.end_date)
                  const succStart = toDate(succ.start_date)
                  if (!predEnd || !succStart) return null
                  const x1 = daysBetween(rangeStart, predEnd) * DAY_PX + DAY_PX
                  const y1 = predIdx * ROW_H + ROW_H / 2
                  const x2 = daysBetween(rangeStart, succStart) * DAY_PX
                  const y2 = succIdx * ROW_H + ROW_H / 2
                  const mx = x1 + 8
                  return (
                    <g key={dep.id}>
                      <polyline points={`${x1},${y1} ${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#8b5cf680" strokeWidth={1.5} strokeDasharray="4 2" markerEnd="url(#arrow)" />
                    </g>
                  )
                })}
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#8b5cf680" />
                  </marker>
                </defs>
              </svg>

              {sorted.map((task, rowIdx) => {
                const live = liveDates.get(task.id)
                const start = live?.start ?? toDate(task.start_date)
                const end   = live?.end   ?? toDate(task.end_date)
                const bStart = toDate(task.baseline_start)
                const bEnd   = toDate(task.baseline_end)
                const left  = start ? daysBetween(rangeStart, start) * DAY_PX : null
                const width = start && end ? Math.max((daysBetween(start, end) + 1) * DAY_PX, 4) : null
                const bLeft  = bStart ? daysBetween(rangeStart, bStart) * DAY_PX : null
                const bWidth = bStart && bEnd ? Math.max((daysBetween(bStart, bEnd) + 1) * DAY_PX, 4) : null
                const color = S[task.status].color
                const isCritical = criticalIds.has(task.id)
                const isDragging = dragState?.taskId === task.id

                return (
                  <div key={task.id} style={{ height: ROW_H, borderBottom: '1px solid var(--border)', position: 'relative', background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                    {/* Weekend shading */}
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = new Date(rangeStart); d.setDate(d.getDate() + i)
                      if (d.getDay() !== 0 && d.getDay() !== 6) return null
                      return <div key={i} style={{ position: 'absolute', left: i * DAY_PX, width: DAY_PX, top: 0, bottom: 0, background: 'rgba(239,68,68,0.03)', pointerEvents: 'none' }} />
                    })}

                    {/* Baseline ghost bar */}
                    {bLeft !== null && bWidth !== null && (
                      <div style={{ position: 'absolute', left: bLeft + 1, width: bWidth - 2, height: task.is_summary ? 8 : 16, top: task.is_summary ? ROW_H / 2 + 4 : ROW_H / 2 - 8 + 16, borderRadius: '3px', background: 'rgba(148,163,184,0.2)', border: '1px dashed #94a3b8', pointerEvents: 'none' }} />
                    )}

                    {/* Main bar */}
                    {left !== null && width !== null && (
                      task.is_milestone ? (
                        <div style={{ position: 'absolute', left: left + width / 2 - 7, top: ROW_H / 2 - 7, width: 14, height: 14, background: '#f59e0b', transform: 'rotate(45deg)', borderRadius: '2px', cursor: 'pointer', zIndex: 3 }} title={task.name} />
                      ) : (
                        <div
                          onMouseDown={e => startDrag(e, task, 'move')}
                          style={{ position: 'absolute', left: left + 2, width: Math.max(width - 4, 6), height: task.is_summary ? 10 : 20, top: task.is_summary ? ROW_H / 2 : ROW_H / 2 - 10, borderRadius: task.is_summary ? '3px 3px 0 0' : '4px', background: `${color}28`, border: `2px solid ${isCritical ? '#ef4444' : color}`, overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', zIndex: 3, boxShadow: isDragging ? `0 2px 8px ${color}44` : 'none', transition: isDragging ? 'none' : 'box-shadow 0.1s' }}
                        >
                          <div style={{ height: '100%', width: `${task.progress}%`, background: `${color}60`, transition: isDragging ? 'none' : 'width 0.3s' }} />
                          {/* Resize handles */}
                          <div onMouseDown={e => startDrag(e, task, 'left')} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'w-resize', background: 'transparent', zIndex: 4 }} />
                          <div onMouseDown={e => startDrag(e, task, 'right')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'e-resize', background: 'transparent', zIndex: 4 }} />
                        </div>
                      )
                    )}

                    {/* No date label */}
                    {left === null && <span style={{ paddingLeft: '8px', fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: `${ROW_H}px` }}>Sin fecha</span>}
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

/* ══════════════════════════════════
   TAB 4: LÍNEA BASE
══════════════════════════════════ */
function BaselineTab({ projectId, baselines, tasks, onMutate, onMutateTasks }: { projectId: string; baselines: ProjectBaseline[]; tasks: ProjectTask[]; onMutate: () => void; onMutateTasks: () => void }) {
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [comparing, setComparing] = useState<string | null>(null)
  const [baselineData, setBaselineData] = useState<ProjectTask[]>([])

  async function saveBaseline() {
    if (!newName.trim()) return
    setSaving(true)
    await fetch(`/api/projects/${projectId}/baselines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) })
    setNewName(''); setSaving(false); onMutate()
  }

  async function deleteBaseline(id: string) {
    await fetch(`/api/projects/${projectId}/baselines?baseline_id=${id}`, { method: 'DELETE' })
    onMutate()
  }

  async function applyBaseline(id: string) {
    await fetch(`/api/projects/${projectId}/baselines`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseline_id: id }) })
    onMutateTasks()
  }

  async function loadComparison(id: string) {
    const { data } = await (await fetch(`/api/projects/${projectId}/baselines`)).json()
    const bl = (data || baselines).find((b: any) => b.id === id)
    if (bl?.snapshot) { setBaselineData(bl.snapshot); setComparing(id) }
    else {
      const res = await fetch(`/api/projects/${projectId}/baselines`)
      const full = (await res.json()).baselines ?? []
      const found = full.find((b: any) => b.id === id)
      if (found) { setBaselineData(found.snapshot ?? []); setComparing(id) }
    }
  }

  const baseMap = new Map(baselineData.map(t => [t.id, t]))

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Save new baseline */}
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Archive size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input placeholder="Nombre de la línea base (ej: v1.0 – Planificación inicial)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveBaseline()} style={{ flex: 1, padding: '7px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '0.82rem', outline: 'none', color: 'var(--foreground)' }} />
        <button onClick={saveBaseline} disabled={!newName.trim() || saving} style={{ padding: '7px 16px', borderRadius: '9px', background: 'var(--primary)', border: 'none', color: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Guardando...' : 'Guardar línea base actual'}</button>
      </div>

      {/* Baseline list */}
      {baselines.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Archive size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
          <p>Sin líneas base guardadas. Guarda el cronograma actual para comparar el avance futuro.</p>
        </div>
      ) : (
        <>
          {baselines.map(b => (
            <div key={b.id} style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', background: comparing === b.id ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>{b.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(b.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <button onClick={() => applyBaseline(b.id)} title="Aplicar como referencia en Gantt" style={{ padding: '5px 10px', borderRadius: '7px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#8b5cf6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Aplicar al Gantt</button>
              <button onClick={() => comparing === b.id ? setComparing(null) : loadComparison(b.id)} style={{ padding: '5px 10px', borderRadius: '7px', background: comparing === b.id ? 'rgba(139,92,246,0.15)' : 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)', fontSize: '0.72rem', cursor: 'pointer' }}>{comparing === b.id ? 'Cerrar' : 'Comparar'}</button>
              <button onClick={() => deleteBaseline(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', opacity: 0.5 }}><Trash2 size={14} /></button>
            </div>
          ))}

          {/* Comparison table */}
          {comparing && (
            <div style={{ padding: '0.875rem 1.25rem' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--foreground)' }}>Comparación: Línea base vs. Estado actual</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)' }}>
                      {['EDT', 'Nombre', 'Inicio plan.', 'Inicio actual', 'Fin plan.', 'Fin actual', 'Avance plan.', 'Avance actual', 'Desviación'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(t => {
                      const base = baseMap.get(t.id)
                      if (!base) return null
                      const bStart = base.start_date || '—'
                      const bEnd   = base.end_date   || '—'
                      const aDays  = t.start_date && t.end_date ? daysBetween(new Date(t.start_date + 'T12:00:00'), new Date(t.end_date + 'T12:00:00')) : null
                      const bDays  = base.start_date && base.end_date ? daysBetween(new Date(base.start_date + 'T12:00:00'), new Date(base.end_date + 'T12:00:00')) : null
                      const dev    = aDays != null && bDays != null ? aDays - bDays : null
                      const progDev = t.progress - (base.progress || 0)
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t.wbs || '—'}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--foreground)', paddingLeft: `${10 + (t.outline_level - 1) * 10}px`, fontWeight: t.is_summary ? 600 : 400 }}>{t.name}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{bStart}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--foreground)' }}>{t.start_date || '—'}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{bEnd}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--foreground)' }}>{t.end_date || '—'}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{base.progress}%</td>
                          <td style={{ padding: '5px 10px', color: 'var(--foreground)' }}>{t.progress}%</td>
                          <td style={{ padding: '5px 10px' }}>
                            {dev != null && <span style={{ color: dev > 0 ? '#ef4444' : dev < 0 ? '#22c55e' : 'var(--text-muted)', fontWeight: 600 }}>{dev > 0 ? `+${dev}d` : dev < 0 ? `${dev}d` : '—'}</span>}
                            {progDev !== 0 && <span style={{ marginLeft: '6px', color: progDev > 0 ? '#22c55e' : '#ef4444', fontSize: '0.65rem' }}>{progDev > 0 ? `+${progDev}%` : `${progDev}%`}</span>}
                          </td>
                        </tr>
                      )
                    })}
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

/* ══════════════════════════════════
   TAB 5: DASHBOARD
══════════════════════════════════ */
function DashboardTab({ tasks, deps, criticalIds, project }: { tasks: ProjectTask[]; deps: TaskDependency[]; criticalIds: Set<string>; project: Project }) {
  const total      = tasks.length
  const byStatus   = Object.keys(S).reduce((acc, k) => ({ ...acc, [k]: tasks.filter(t => t.status === k).length }), {} as Record<string, number>)
  const progress   = total ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total) : 0
  const inReview   = tasks.filter(t => t.status === 'in_review')
  const rejected   = tasks.filter(t => t.status === 'rejected')
  const today      = new Date()
  const overdue    = tasks.filter(t => t.end_date && new Date(t.end_date + 'T23:59:59') < today && t.status !== 'completed' && t.status !== 'approved')
  const milestones = tasks.filter(t => t.is_milestone && t.end_date && new Date(t.end_date + 'T23:59:59') >= today).sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1)).slice(0, 5)
  const critList   = tasks.filter(t => criticalIds.has(t.id))

  const Card = ({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) => (
    <div style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderRadius: '12px', padding: '1rem 1.25rem', borderLeft: `4px solid ${color}` }}>
      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: '1.75rem', fontWeight: 800, color }}>{value}</p>
      {sub && <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
        <Card label="Avance global"  value={`${progress}%`}          color="var(--primary)" sub={`${total} partidas`} />
        <Card label="Completadas"    value={byStatus.completed || 0}  color="#059669" />
        <Card label="En curso"       value={byStatus.in_progress || 0} color="#f59e0b" />
        <Card label="En revisión"    value={byStatus.in_review || 0}   color="#8b5cf6" />
        <Card label="Rechazadas"     value={byStatus.rejected || 0}    color="#ef4444" />
        <Card label="Vencidas"       value={overdue.length}            color="#dc2626" sub="Sin completar" />
        <Card label="Ruta crítica"   value={critList.length}           color="#ef4444" sub="tareas críticas" />
      </div>

      {/* Status bars */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700 }}>Distribución por estado</p>
        <div style={{ display: 'flex', height: '20px', borderRadius: '6px', overflow: 'hidden', gap: '1px' }}>
          {Object.entries(S).map(([k, v]) => {
            const count = byStatus[k] || 0
            const pct = total ? (count / total) * 100 : 0
            if (pct === 0) return null
            return <div key={k} style={{ width: `${pct}%`, background: v.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={`${v.label}: ${count}`}>{pct > 8 && <span style={{ fontSize: '0.6rem', color: 'white', fontWeight: 700 }}>{count}</span>}</div>
          })}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
          {Object.entries(S).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: v.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{v.label} ({byStatus[k] || 0})</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* In review */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700 }}>⏳ En revisión ({inReview.length})</p>
          {inReview.length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sin tareas pendientes de aprobación</p> : inReview.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.65rem' }}>{t.wbs}</span>
              <span style={{ flex: 1, color: 'var(--foreground)' }}>{t.name}</span>
              <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{t.progress_proposed}%</span>
            </div>
          ))}
        </div>

        {/* Overdue */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700 }}>🔴 Vencidas ({overdue.length})</p>
          {overdue.length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sin tareas vencidas</p> : overdue.slice(0, 6).map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.65rem' }}>{t.wbs}</span>
              <span style={{ flex: 1, color: 'var(--foreground)' }}>{t.name}</span>
              <span style={{ color: '#ef4444', fontWeight: 600 }}>{t.end_date}</span>
            </div>
          ))}
        </div>

        {/* Milestones */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700 }}>🎯 Próximos hitos ({milestones.length})</p>
          {milestones.length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sin hitos próximos</p> : milestones.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '0.75rem' }}>
              <Flag size={11} color="#f59e0b" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--foreground)' }}>{t.name}</span>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{t.end_date}</span>
            </div>
          ))}
        </div>

        {/* Critical path */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', fontWeight: 700 }}>🔥 Ruta crítica ({critList.length})</p>
          {critList.length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{deps.length === 0 ? 'Agrega dependencias para calcular la ruta crítica' : 'Sin ruta crítica calculada'}</p> : critList.slice(0, 6).map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '0.75rem' }}>
              <AlertCircle size={11} color="#ef4444" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--foreground)' }}>{t.name}</span>
              <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: S[t.status].bg, color: S[t.status].color }}>{S[t.status].label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
