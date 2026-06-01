/**
 * schedule-roles.ts
 *
 * ─── ROLES ───────────────────────────────────────────────────────────────────
 *  admin        — Administrador de obra.  Puede aprobar, rechazar y completar.
 *  professional — Responsable/profesional. Puede iniciar, proponer avance y reabrir.
 *  none         — Sin acceso al proyecto.
 *
 * ─── RESOLUCIÓN DE ROL ───────────────────────────────────────────────────────
 *  1. El dueño del proyecto (projects.user_id) → siempre 'admin'.
 *  2. Miembro explícito en schedule_project_members → su role asignado.
 *  3. Usuario con asignación directa sobre la tarea → 'professional'.
 *  4. Cualquier otro → 'none'.
 *
 * ─── MÁQUINA DE ESTADOS ──────────────────────────────────────────────────────
 *
 *  pending ──[start]──► in_progress ──[propose]──► in_review
 *                                                      │
 *                                           ┌──────────┴──────────┐
 *                                      [approve]              [reject]
 *                                           │                      │
 *                                        approved              rejected
 *                                           │                      │
 *                                      [complete]             [reopen]
 *                                           │                      │
 *                                        completed           in_progress
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'completed'

export type Action = 'start' | 'propose' | 'approve' | 'reject' | 'complete' | 'reopen'

export type Role = 'admin' | 'professional' | 'none'

/** Mapeo Action → accion en DB para ApprovalLog */
export const ACTION_TO_ACCION: Record<Action, string> = {
  start:    'inicia',
  propose:  'reporta',
  approve:  'aprueba',
  reject:   'rechaza',
  complete: 'completa',
  reopen:   'reabre',
}

interface Transition {
  to:               TaskStatus
  roles:            Role[]
  requiresProgress: boolean   // necesita pct_avance en el body
  requiresComment:  boolean   // comentario obligatorio
}

// ─── Máquina de estados ───────────────────────────────────────────────────────

export const STATE_MACHINE: Record<TaskStatus, Partial<Record<Action, Transition>>> = {
  pending: {
    start: { to: 'in_progress', roles: ['admin', 'professional'], requiresProgress: false, requiresComment: false },
  },
  in_progress: {
    propose: { to: 'in_review',   roles: ['admin', 'professional'], requiresProgress: true,  requiresComment: false },
  },
  in_review: {
    approve: { to: 'approved',    roles: ['admin'],                 requiresProgress: false, requiresComment: false },
    reject:  { to: 'rejected',    roles: ['admin'],                 requiresProgress: false, requiresComment: true  },
  },
  approved: {
    complete: { to: 'completed',  roles: ['admin'],                 requiresProgress: false, requiresComment: false },
  },
  rejected: {
    reopen: { to: 'in_progress',  roles: ['admin', 'professional'], requiresProgress: false, requiresComment: false },
  },
  completed: {},
}

// ─── Validación de transición (función pura) ──────────────────────────────────

export type ValidationOk = { ok: true; transition: Transition }
export type ValidationErr = { ok: false; error: string; status: number }

export function validateTransition(
  currentStatus: TaskStatus,
  action: Action,
  role: Role,
  pctAvance?: number | null,
  comentario?: string | null,
): ValidationOk | ValidationErr {
  const transitions = STATE_MACHINE[currentStatus]
  const transition  = transitions?.[action]

  if (!transition) {
    return {
      ok: false,
      error: `Acción "${action}" no permitida en estado "${currentStatus}"`,
      status: 422,
    }
  }

  if (!transition.roles.includes(role)) {
    return {
      ok: false,
      error: `Tu rol "${role}" no puede ejecutar "${action}". Se requiere: ${transition.roles.join(' o ')}`,
      status: 403,
    }
  }

  if (transition.requiresProgress && (pctAvance == null || pctAvance < 0 || pctAvance > 100)) {
    return {
      ok: false,
      error: 'pct_avance es obligatorio (0-100) para esta acción',
      status: 400,
    }
  }

  if (transition.requiresComment && !comentario?.trim()) {
    return {
      ok: false,
      error: 'comentario es obligatorio para rechazar una tarea',
      status: 400,
    }
  }

  return { ok: true, transition }
}

// ─── Resolución de rol (requiere Supabase) ────────────────────────────────────

/**
 * Determina el rol del usuario en el contexto del proyecto/tarea.
 * Ver doc del módulo para el orden de prioridad.
 */
export async function resolveRole(
  supabase: SupabaseClient,
  projectId: string,
  taskId:    string,
  userId:    string,
): Promise<Role> {
  // 1. Dueño del proyecto → admin
  const { data: project } = await supabase
    .from('projects').select('user_id').eq('id', projectId).single()
  if (project?.user_id === userId) return 'admin'

  // 2. Miembro explícito
  const { data: member } = await supabase
    .from('schedule_project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()
  if (member?.role === 'admin')        return 'admin'
  if (member?.role === 'professional') return 'professional'

  // 3. Asignado a esta tarea específica
  const { data: assignment } = await supabase
    .from('schedule_assignments')
    .select('id')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .single()
  if (assignment) return 'professional'

  return 'none'
}
