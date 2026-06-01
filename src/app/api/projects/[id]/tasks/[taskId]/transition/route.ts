/**
 * POST /api/projects/[id]/tasks/[taskId]/transition
 *
 * Endpoint canónico para el flujo de estados de una tarea del cronograma.
 * Aplica la máquina de estados, valida permisos por rol y registra en ApprovalLog.
 *
 * Body:
 * {
 *   action:      'start' | 'propose' | 'approve' | 'reject' | 'complete' | 'reopen'
 *   pct_avance?: number       — requerido para 'propose' (0–100)
 *   comentario?: string       — requerido para 'reject', opcional en los demás
 * }
 *
 * Respuesta: { task, role, log }
 *
 * ─── Flujo de permisos ───────────────────────────────────────────────────────
 *  professional  →  start, propose, reopen
 *  admin         →  todas las acciones
 *  none          →  rechazado 403
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapTaskToFrontend } from '@/lib/schedule-mappers'
import {
  resolveRole,
  validateTransition,
  ACTION_TO_ACCION,
  type Action,
  type TaskStatus,
} from '@/lib/schedule-roles'
import {
  notifyTaskInReview,
  notifyTaskApproved,
  notifyTaskRejected,
} from '@/lib/schedule-notifications'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: projectId, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // ── Cargar tarea actual ────────────────────────────────────────────────────
  const { data: task } = await supabase
    .from('project_tasks')
    .select('id, name, wbs, status, pct_avance_propuesto, pct_avance_aprobado, project_id')
    .eq('id', taskId).eq('project_id', projectId)
    .single()

  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  // ── Resolver rol del usuario ───────────────────────────────────────────────
  const role = await resolveRole(supabase, projectId, taskId, user.id)

  if (role === 'none') {
    return NextResponse.json(
      { error: 'No tienes acceso a este proyecto ni a esta tarea' },
      { status: 403 },
    )
  }

  // ── Parsear body ───────────────────────────────────────────────────────────
  const body = await req.json()
  const action: Action    = body.action
  const pctAvance: number = Number(body.pct_avance ?? body.pctAvance ?? body.progress ?? 0)
  const comentario: string | null = body.comentario ?? body.comment ?? null

  if (!action) {
    return NextResponse.json({ error: 'action es obligatorio' }, { status: 400 })
  }

  // ── Validar transición en el state machine ─────────────────────────────────
  const validation = validateTransition(
    task.status as TaskStatus,
    action,
    role,
    action === 'propose' ? pctAvance : null,
    action === 'reject'  ? comentario : null,
  )

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error, role }, { status: validation.status })
  }

  const { transition } = validation

  // ── Construir el patch para project_tasks ─────────────────────────────────
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status:     transition.to,
    updated_at: now,
  }

  if (action === 'propose') {
    patch.pct_avance_propuesto = pctAvance
  }

  if (action === 'approve') {
    // Al aprobar: copiar avance propuesto → avance aprobado (oficial)
    patch.pct_avance_aprobado = task.pct_avance_propuesto
  }

  // ── Aplicar cambio de estado ───────────────────────────────────────────────
  const { data: updatedTask, error: updateErr } = await supabase
    .from('project_tasks')
    .update(patch)
    .eq('id', taskId)
    .select('*')
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // ── Registrar en ApprovalLog ──────────────────────────────────────────────
  const { data: log } = await supabase
    .from('schedule_approval_logs')
    .insert({
      task_id:    taskId,
      user_id:    user.id,
      accion:     ACTION_TO_ACCION[action],
      comentario: comentario ?? null,
      ...(action === 'propose' ? { pct_avance: pctAvance } : {}),
    })
    .select('*, user:user_id(name, email)')
    .single()

  // ── Notificaciones WhatsApp (fire-and-forget) ─────────────────────────────
  const userName = (log as any)?.user?.name ?? user.email ?? 'Usuario'

  ;(async () => {
    try {
      if (action === 'propose') {
        await notifyTaskInReview(
          supabase, projectId, taskId,
          task.name, task.wbs, pctAvance, userName,
        )
      } else if (action === 'approve') {
        await notifyTaskApproved(
          supabase, taskId, task.name, task.wbs,
          task.pct_avance_propuesto, userName, comentario,
        )
      } else if (action === 'reject') {
        await notifyTaskRejected(
          supabase, taskId, task.name, task.wbs, userName, comentario,
        )
      }
    } catch (e) {
      console.error('[transition] notification error:', e)
    }
  })()

  return NextResponse.json({
    task: mapTaskToFrontend(updatedTask),
    role,
    log: {
      id:         (log as any)?.id,
      accion:     ACTION_TO_ACCION[action],
      action,
      comentario,
      user_name:  userName,
      created_at: (log as any)?.created_at,
    },
  })
}
