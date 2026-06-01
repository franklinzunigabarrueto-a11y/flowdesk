import { describe, it, expect } from 'vitest'
import { validateTransition, STATE_MACHINE, ACTION_TO_ACCION } from '../schedule-roles'
import type { TaskStatus, Action, Role } from '../schedule-roles'

// ─── STATE_MACHINE ────────────────────────────────────────────────────────────

describe('STATE_MACHINE — cobertura de estados', () => {
  it('pending solo acepta start', () => {
    expect(Object.keys(STATE_MACHINE.pending)).toEqual(['start'])
  })
  it('in_progress solo acepta propose', () => {
    expect(Object.keys(STATE_MACHINE.in_progress)).toEqual(['propose'])
  })
  it('in_review acepta approve y reject', () => {
    expect(Object.keys(STATE_MACHINE.in_review).sort()).toEqual(['approve', 'reject'])
  })
  it('approved solo acepta complete', () => {
    expect(Object.keys(STATE_MACHINE.approved)).toEqual(['complete'])
  })
  it('rejected solo acepta reopen', () => {
    expect(Object.keys(STATE_MACHINE.rejected)).toEqual(['reopen'])
  })
  it('completed no acepta ninguna acción', () => {
    expect(Object.keys(STATE_MACHINE.completed)).toHaveLength(0)
  })
})

// ─── ACTION_TO_ACCION ─────────────────────────────────────────────────────────

describe('ACTION_TO_ACCION', () => {
  it('mapea todas las acciones al valor DB correcto', () => {
    expect(ACTION_TO_ACCION.start).toBe('inicia')
    expect(ACTION_TO_ACCION.propose).toBe('reporta')
    expect(ACTION_TO_ACCION.approve).toBe('aprueba')
    expect(ACTION_TO_ACCION.reject).toBe('rechaza')
    expect(ACTION_TO_ACCION.complete).toBe('completa')
    expect(ACTION_TO_ACCION.reopen).toBe('reabre')
  })
})

// ─── validateTransition ───────────────────────────────────────────────────────

function valid(status: TaskStatus, action: Action, role: Role, pct?: number, comment?: string) {
  return validateTransition(status, action, role, pct ?? null, comment ?? null)
}

describe('validateTransition — transiciones válidas', () => {
  it('professional puede iniciar tarea pendiente', () => {
    const r = valid('pending', 'start', 'professional')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.transition.to).toBe('in_progress')
  })

  it('admin puede iniciar tarea pendiente', () => {
    const r = valid('pending', 'start', 'admin')
    expect(r.ok).toBe(true)
  })

  it('professional puede proponer avance en in_progress', () => {
    const r = valid('in_progress', 'propose', 'professional', 75)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.transition.to).toBe('in_review')
  })

  it('admin puede aprobar en in_review', () => {
    const r = valid('in_review', 'approve', 'admin')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.transition.to).toBe('approved')
  })

  it('admin puede rechazar con comentario', () => {
    const r = valid('in_review', 'reject', 'admin', undefined, 'Falta documentación')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.transition.to).toBe('rejected')
  })

  it('admin puede completar tarea aprobada', () => {
    const r = valid('approved', 'complete', 'admin')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.transition.to).toBe('completed')
  })

  it('professional puede reabrir tarea rechazada', () => {
    const r = valid('rejected', 'reopen', 'professional')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.transition.to).toBe('in_progress')
  })
})

describe('validateTransition — permisos insuficientes', () => {
  it('professional NO puede aprobar (in_review)', () => {
    const r = valid('in_review', 'approve', 'professional')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('professional NO puede rechazar (in_review)', () => {
    const r = valid('in_review', 'reject', 'professional', undefined, 'motivo')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('professional NO puede completar (approved)', () => {
    const r = valid('approved', 'complete', 'professional')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('none NO puede ejecutar ninguna acción', () => {
    const actions: Action[] = ['start', 'propose', 'approve', 'reject', 'complete', 'reopen']
    const statuses: TaskStatus[] = ['pending', 'in_progress', 'in_review', 'approved', 'rejected']
    for (const status of statuses) {
      for (const action of actions) {
        const r = validateTransition(status, action, 'none', 50, 'x')
        // Si la transición existe para ese estado/acción, debe fallar por permisos
        const t = STATE_MACHINE[status] as any
        if (t?.[action]) {
          expect(r.ok).toBe(false)
        }
      }
    }
  })
})

describe('validateTransition — acciones inválidas para el estado', () => {
  it('approve en estado pending → 422', () => {
    const r = valid('pending', 'approve', 'admin')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(422)
  })

  it('propose en estado completed → 422', () => {
    const r = valid('completed', 'propose', 'admin', 100)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(422)
  })

  it('start en estado in_review → 422', () => {
    const r = valid('in_review', 'start', 'admin')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(422)
  })
})

describe('validateTransition — validaciones de campo', () => {
  it('propose sin pct_avance → 400', () => {
    const r = validateTransition('in_progress', 'propose', 'professional', null, null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('propose con pct_avance fuera de rango → 400', () => {
    const r = validateTransition('in_progress', 'propose', 'professional', 150, null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('reject sin comentario → 400', () => {
    const r = validateTransition('in_review', 'reject', 'admin', null, '')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('reject con comentario válido → ok', () => {
    const r = validateTransition('in_review', 'reject', 'admin', null, 'Revisar los planos')
    expect(r.ok).toBe(true)
  })
})
