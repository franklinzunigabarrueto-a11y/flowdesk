'use client'

import { useState, useEffect } from 'react'
import { Plus, CheckCircle, Circle, Clock, Flag, Trash2 } from 'lucide-react'
import { Task, TaskStatus, TaskPriority } from '@/types'
import { formatDate } from '@/lib/utils'

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' as TaskPriority, due_date: '' })

  useEffect(() => {
    fetchTasks()
  }, [])

  async function fetchTasks() {
    setLoading(true)
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  async function toggleTask(task: Task) {
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed'
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTask.title.trim()) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    })
    const data = await res.json()
    if (data.task) {
      setTasks(prev => [data.task, ...prev])
      setNewTask({ title: '', description: '', priority: 'medium', due_date: '' })
      setShowForm(false)
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
              <input
                type="date"
                value={newTask.due_date}
                onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                style={{
                  padding: '10px 14px', borderRadius: '10px',
                  background: 'var(--background)', border: '1px solid var(--border)',
                  color: 'var(--foreground)', fontSize: '0.875rem', outline: 'none'
                }}
              />
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
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '1rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderLeft: task.status !== 'completed' ? `3px solid ${PRIORITY_COLORS[task.priority]}` : '3px solid var(--border)',
              borderRadius: '14px',
              opacity: task.status === 'completed' ? 0.55 : 1,
              transition: 'all 0.2s'
            }}>
              <button
                onClick={() => toggleTask(task)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, marginTop: '1px' }}
              >
                {task.status === 'completed'
                  ? <CheckCircle size={20} color="var(--success)" />
                  : <Circle size={20} color="var(--text-muted)" />
                }
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: '0.9rem', fontWeight: 500,
                  textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                  color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--foreground)'
                }}>
                  {task.title}
                </p>
                {task.description && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {task.description}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '0.72rem', color: PRIORITY_COLORS[task.priority],
                    background: `${PRIORITY_COLORS[task.priority]}15`,
                    padding: '2px 8px', borderRadius: '100px'
                  }}>
                    <Flag size={10} /> {PRIORITY_LABELS[task.priority]}
                  </span>
                  {task.due_date && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '0.72rem', color: 'var(--text-muted)'
                    }}>
                      <Clock size={10} /> {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => deleteTask(task.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '4px', flexShrink: 0,
                  opacity: 0.5, transition: 'opacity 0.2s'
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
