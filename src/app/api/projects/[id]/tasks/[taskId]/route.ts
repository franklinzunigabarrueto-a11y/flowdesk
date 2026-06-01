import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapTaskToFrontend, mapTaskPatchToDB } from '@/lib/schedule-mappers'
import { validateDates, detectCycle, recalculateWBS } from '@/lib/schedule-validators'
import { runCPM } from '@/lib/schedule-cpm'

// GET /api/projects/[id]/tasks/[taskId]
// Devuelve una tarea individual con su WBS actualizado.
export async function GET(_: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: task, error } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('id', taskId).eq('project_id', id)
    .single()

  if (error || !task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  return NextResponse.json({ task: mapTaskToFrontend(task) })
}

// PATCH /api/projects/[id]/tasks/[taskId]
// Actualiza campos de una tarea con validaciones de fecha y anti-ciclo.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()

  // ── Validación de fechas ───────────────────────────────────────────────────
  // Si solo viene una de las dos, leer la otra del registro actual
  let startDate = body.start_date
  let endDate   = body.end_date

  if ((startDate && !endDate) || (!startDate && endDate)) {
    const { data: existing } = await supabase
      .from('project_tasks').select('start_date, end_date').eq('id', taskId).single()
    startDate = startDate ?? existing?.start_date
    endDate   = endDate   ?? existing?.end_date
  }

  const dateErr = validateDates(startDate, endDate)
  if (dateErr) return NextResponse.json({ error: dateErr.message, field: dateErr.field }, { status: 422 })

  // ── Validación anti-ciclo si cambia parent_id ─────────────────────────────
  if ('parent_id' in body && body.parent_id !== undefined) {
    const hasCycle = await detectCycle(supabase, taskId, body.parent_id)
    if (hasCycle) {
      return NextResponse.json(
        { error: 'No se puede asignar este padre: crearía un ciclo en la jerarquía', field: 'parent_id' },
        { status: 422 },
      )
    }
  }

  const patch = { ...mapTaskPatchToDB(body), updated_at: new Date().toISOString() }

  const { data: task, error } = await supabase
    .from('project_tasks')
    .update(patch)
    .eq('id', taskId).eq('project_id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalcular WBS si cambió la jerarquía o el orden
  const hierarchyChanged = 'parent_id' in body || 'sort_order' in body
  if (hierarchyChanged) await recalculateWBS(supabase, id)

  // Recalcular CPM si cambiaron las fechas o la duración
  const datesChanged = 'start_date' in body || 'end_date' in body || 'duration_days' in body || 'duracion' in body
  if (datesChanged) await runCPM(supabase, id)

  const { data: updated } = await supabase
    .from('project_tasks').select('*').eq('id', taskId).single()

  return NextResponse.json({ task: mapTaskToFrontend(updated ?? task) })
}

// DELETE /api/projects/[id]/tasks/[taskId]
// Elimina la tarea. Los hijos directos quedan huérfanos (parent_id en cascada los elimina).
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error } = await supabase
    .from('project_tasks').delete().eq('id', taskId).eq('project_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateWBS(supabase, id)
  return NextResponse.json({ ok: true })
}
