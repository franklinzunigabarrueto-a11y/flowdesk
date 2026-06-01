/**
 * POST /api/projects/[id]/tasks/[taskId]/move
 *
 * Gestiona la jerarquía WBS: indent, outdent, move_up, move_down.
 * Tras cada operación recalcula WBS y outline_level de todo el proyecto.
 *
 * Body: { action: 'indent' | 'outdent' | 'move_up' | 'move_down' }
 *
 * Reglas:
 *   indent    — hace al task hijo del hermano inmediatamente anterior (mismo padre)
 *   outdent   — sube al task un nivel (pasa a ser hermano de su padre actual)
 *   move_up   — intercambia sort_order con el hermano anterior (mismo padre)
 *   move_down — intercambia sort_order con el hermano siguiente (mismo padre)
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapTaskToFrontend } from '@/lib/schedule-mappers'
import { recalculateWBS } from '@/lib/schedule-validators'

const VALID_ACTIONS = ['indent', 'outdent', 'move_up', 'move_down'] as const
type MoveAction = typeof VALID_ACTIONS[number]

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: projectId, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar propiedad del proyecto
  const { data: project } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json()
  const action = body.action as MoveAction

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Acción inválida. Valores permitidos: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  // Cargar la tarea actual
  const { data: task } = await supabase
    .from('project_tasks')
    .select('id, parent_id, sort_order, outline_level')
    .eq('id', taskId).eq('project_id', projectId)
    .single()

  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  // Cargar todos los hermanos (mismo padre, mismo proyecto), ordenados
  const { data: siblings } = await supabase
    .from('project_tasks')
    .select('id, parent_id, sort_order, outline_level')
    .eq('project_id', projectId)
    .eq('parent_id', task.parent_id ?? '')   // placeholder; ver abajo
    .order('sort_order', { ascending: true })

  // Supabase no soporta .eq('parent_id', null) directamente con eq — usar filtro explícito
  const { data: siblingsRaw } = await supabase
    .from('project_tasks')
    .select('id, parent_id, sort_order, outline_level')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  const allTasks = (siblingsRaw ?? []) as {
    id: string; parent_id: string | null; sort_order: number; outline_level: number
  }[]

  const siblingsArr = allTasks.filter(t => (t.parent_id ?? null) === (task.parent_id ?? null))
  const taskIdx     = siblingsArr.findIndex(t => t.id === taskId)

  // ── INDENT ─────────────────────────────────────────────────────────────────
  if (action === 'indent') {
    if (taskIdx === 0) {
      return NextResponse.json({ error: 'No hay hermano anterior para anidar' }, { status: 422 })
    }
    const newParent = siblingsArr[taskIdx - 1]

    // sort_order al final de los hijos del nuevo padre
    const currentChildren = allTasks.filter(t => t.parent_id === newParent.id)
    const newSortOrder = currentChildren.length
      ? Math.max(...currentChildren.map(t => t.sort_order)) + 1
      : 0

    await supabase.from('project_tasks').update({
      parent_id:    newParent.id,
      sort_order:   newSortOrder,
      updated_at:   new Date().toISOString(),
    }).eq('id', taskId)
  }

  // ── OUTDENT ────────────────────────────────────────────────────────────────
  else if (action === 'outdent') {
    if (!task.parent_id) {
      return NextResponse.json({ error: 'La tarea ya está en el nivel raíz' }, { status: 422 })
    }

    const parent = allTasks.find(t => t.id === task.parent_id)
    if (!parent) return NextResponse.json({ error: 'Padre no encontrado' }, { status: 404 })

    // Mover al nivel del padre: insertar justo después del padre en su grupo
    const grandparentSiblings = allTasks
      .filter(t => (t.parent_id ?? null) === (parent.parent_id ?? null))
      .sort((a, b) => a.sort_order - b.sort_order)

    const parentIdx  = grandparentSiblings.findIndex(t => t.id === parent.id)
    const insertAfter = parentIdx + 1

    // Desplazar hacia abajo los hermanos del padre que están después del punto de inserción
    const toShift = grandparentSiblings.slice(insertAfter)
    for (const t of toShift) {
      await supabase.from('project_tasks')
        .update({ sort_order: t.sort_order + 1 })
        .eq('id', t.id)
    }

    await supabase.from('project_tasks').update({
      parent_id:  parent.parent_id ?? null,
      sort_order: grandparentSiblings[parentIdx]
        ? grandparentSiblings[parentIdx].sort_order + 1
        : 0,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)
  }

  // ── MOVE UP ────────────────────────────────────────────────────────────────
  else if (action === 'move_up') {
    if (taskIdx === 0) {
      return NextResponse.json({ error: 'La tarea ya es la primera de su nivel' }, { status: 422 })
    }
    const prev = siblingsArr[taskIdx - 1]
    // Intercambiar sort_order
    await supabase.from('project_tasks')
      .update({ sort_order: prev.sort_order, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    await supabase.from('project_tasks')
      .update({ sort_order: task.sort_order, updated_at: new Date().toISOString() })
      .eq('id', prev.id)
  }

  // ── MOVE DOWN ──────────────────────────────────────────────────────────────
  else if (action === 'move_down') {
    if (taskIdx === siblingsArr.length - 1) {
      return NextResponse.json({ error: 'La tarea ya es la última de su nivel' }, { status: 422 })
    }
    const next = siblingsArr[taskIdx + 1]
    await supabase.from('project_tasks')
      .update({ sort_order: next.sort_order, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    await supabase.from('project_tasks')
      .update({ sort_order: task.sort_order, updated_at: new Date().toISOString() })
      .eq('id', next.id)
  }

  // Recalcular WBS y outline_level para todo el proyecto
  await recalculateWBS(supabase, projectId)

  // Devolver lista completa actualizada
  const { data: tasks } = await supabase
    .from('project_tasks').select('*').eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  return NextResponse.json({ tasks: (tasks ?? []).map(mapTaskToFrontend) })
}
