'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())
import { Plus, CheckCircle, Circle, Clock, Flag, Trash2, X, Pencil, Check } from 'lucide-react'
import { Task, TaskStatus, TaskPriority } from '@/types'
import { formatDate } from '@/lib/utils'
import DatePicker from '@/components/ui/DatePicker'

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#22c55e',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
}

export default function TasksView() {
  const { data, mutate } = useSWR('/api/tasks', fetcher)
  const tasks: Task[] = data?.tasks ?? []
  const loading = !data
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const closeLightbox = useCallback(() => setLightboxUrl(null), [])
  useEffect(() => {
    if (!lightboxUrl) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxUrl, closeLightbox])
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' as TaskPriority, due_date: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', description: '', priority: 'medium' as TaskPriority, due_date: '' })
  const [editSaving, setEditSaving] = useState(false)

  async function toggleTask(task: Task) {
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed'
    mutate({ tasks: tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t) }, false)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    mutate()
  }

  async function deleteTask(id: string) {
    mutate({ tasks: tasks.filter(t => t.id !== id) }, false)
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    mutate()
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTask.title.trim()) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    })
    const resData = await res.json()
    if (resData.task) {
      setNewTask({ title: '', description: '', priority: 'medium', due_date: '' })
      setShowForm(false)
      mutate()
    }
  }

  function startEdit(task: Task) {
    setEditDraft({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      due_date: task.due_date || '',
    })
    setEditingId(task.id)
  }

  async function saveEdit(taskId: string) {
    if (!editDraft.title.trim()) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editDraft.title,
          description: editDraft.description,
          priority: editDraft.priority,
          due_date: editDraft.due_date || null,
        }),
      })
      setEditingId(null)
      mutate()
    } finally {
      setEditSaving(false)
    }
  }

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {lightboxUrl && (
        <div onClick={closeLightbox} style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
        }}>
          <button onClick={closeLightbox} style={{
            position: 'absolute', top: '1.25rem', right: '1.25rem',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%', width: '40px', height: '40px',
            color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={20} />
          </button>
          <img src={lightboxUrl} alt="Adjunto" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: '14px', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', cursor: 'default' }}
          />
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Tareas</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            {counts.pending} pendiente{counts.pending !== 1 ? 's' : ''} · {counts.completed} completada{counts.completed !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '10px',
            background: 'var(--primary)',
            border: 'none', color: 'white', cursor: 'pointer',
            fontSize: '0.875rem', fontWeight: 600,
            boxShadow: '0 0 15px var(--primary-glow)',
          }}
        >
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <form onSubmit={createTask} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <input
              type="text"
              placeholder="Título de la tarea..."
              value={newTask.title}
              onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
              required
              style={{
                padding: '10px 14px', borderRadius: '10px',
                background: 'var(--background)', border: '1px solid var(--border)',
                color: 'var(--foreground)', fontSize: '0.95rem', outline: 'none'
              }}
            />
            <textarea
              placeholder="Descripción (opcional)..."
              value={newTask.description}
              onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))}
              rows={2}
              style={{
                padding: '10px 14px', borderRadius: '10px',
                background: 'var(--background)', border: '1px solid var(--border)',
                color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none', resize: 'vertical'
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <select
                value={newTask.priority}
                onChange={e => setNewTask(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                style={{
                  padding: '10px 14px', borderRadius: '10px',
                  background: 'var(--background)', border: '1px solid var(--border)',
                  color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none'
                }}
              >
                <option value="low">Prioridad baja</option>
                <option value="medium">Prioridad media</option>
                <option value="high">Prioridad alta</option>
              </select>
              <DatePicker value={newTask.due_date} onChange={d => setNewTask(p => ({ ...p, due_date: d }))} placeholder="Fecha límite" />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowForm(false)} style={{
                padding: '8px 16px', borderRadius: '8px',
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem'
              }}>
                Cancelar
              </button>
              <button type="submit" style={{
                padding: '8px 20px', borderRadius: '8px',
                background: 'var(--primary)', border: 'none',
                color: 'white', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600
              }}>
                Crear tarea
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(['all', 'pending', 'in_progress', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: filter === f ? 600 : 400,
              background: filter === f ? 'var(--primary)' : 'var(--surface)',
              border: filter === f ? 'none' : '1px solid var(--border)',
              color: filter === f ? 'white' : 'var(--text-muted)',
              transition: 'all 0.2s',
              boxShadow: filter === f ? '0 0 10px var(--primary-glow)' : 'none',
            }}
          >
            {f === 'all' ? 'Todas' : STATUS_LABELS[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Cargando tareas...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '16px', color: 'var(--text-muted)'
        }}>
          <CheckCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>Sin tareas aquí</p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Crea una o escríbela desde WhatsApp.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(task => (
            <div key={task.id} style={{
              padding: '1rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderLeft: task.status !== 'completed' ? `3px solid ${PRIORITY_COLORS[task.priority]}` : '3px solid var(--border)',
              borderRadius: '14px',
              opacity: task.status === 'completed' ? 0.55 : 1,
              transition: 'all 0.2s'
            }}>
              {editingId === task.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input autoFocus value={editDraft.title}
                    onChange={e => setEditDraft(p => ({ ...p, title: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(task.id); if (e.key === 'Escape') setEditingId(null) }}
                    style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--primary)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', fontWeight: 500, outline: 'none' }}
                  />
                  <textarea value={editDraft.description} placeholder="Descripción (opcional)" rows={2}
                    onChange={e => setEditDraft(p => ({ ...p, description: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <select value={editDraft.priority} onChange={e => setEditDraft(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                      style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.85rem', outline: 'none' }}
                    >
                      <option value="low">Prioridad baja</option>
                      <option value="medium">Prioridad media</option>
                      <option value="high">Prioridad alta</option>
                    </select>
                    <DatePicker value={editDraft.due_date} onChange={d => setEditDraft(p => ({ ...p, due_date: d }))} placeholder="Fecha límite" />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)} style={{ padding: '6px 14px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem' }}>Cancelar</button>
                    <button onClick={() => saveEdit(task.id)} disabled={editSaving} style={{ padding: '6px 16px', borderRadius: '8px', background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} /> {editSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <button onClick={() => toggleTask(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, marginTop: '1px' }}>
                      {task.status === 'completed' ? <CheckCircle size={20} color="var(--success)" /> : <Circle size={20} color="var(--text-muted)" />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 500, textDecoration: task.status === 'completed' ? 'line-through' : 'none', color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--foreground)' }}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{task.description}</p>
                      )}
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: PRIORITY_COLORS[task.priority], background: `${PRIORITY_COLORS[task.priority]}15`, padding: '2px 8px', borderRadius: '100px' }}>
                          <Flag size={10} /> {PRIORITY_LABELS[task.priority]}
                        </span>
                        {task.due_date && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <Clock size={10} /> {formatDate(task.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button onClick={() => startEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '6px', opacity: 0.6 }} title="Editar tarea">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteTask(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', flexShrink: 0, opacity: 0.5 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {(task as any).image_url && (
                    <div style={{ marginTop: '10px', maxWidth: '360px' }}>
                      <img src={(task as any).image_url} alt="Adjunto" onClick={() => setLightboxUrl((task as any).image_url)}
                        style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', display: 'block', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'zoom-in' }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
