import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapAssignmentToFrontend } from '@/lib/schedule-mappers'

async function auth(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false }
  const { data: p } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  return { supabase, ok: !!p }
}

// GET /api/projects/[id]/assignments/[assignmentId]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const { id, assignmentId } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data, error } = await supabase
    .from('schedule_assignments')
    .select('*, resource:resource_id(*), user:user_id(id,name,email), task:task_id(id,name,wbs,start_date,end_date)')
    .eq('id', assignmentId)
    .in('task_id', supabase.from('project_tasks').select('id').eq('project_id', id) as any)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })
  return NextResponse.json({ assignment: mapAssignmentToFrontend(data) })
}

// PATCH /api/projects/[id]/assignments/[assignmentId]
// Actualiza unidades y recalcula costo.
// Body: { units? | unidades?, user_id? }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const { id, assignmentId } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  // Cargar asignación actual para calcular costo
  const { data: existing } = await supabase
    .from('schedule_assignments')
    .select('resource_id, unidades')
    .eq('id', assignmentId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })

  const newUnidades = body.unidades ?? body.units ?? existing.unidades

  // Recalcular costo si cambian las unidades
  let costo: number | undefined
  if (existing.resource_id) {
    const { data: res } = await supabase
      .from('schedule_resources')
      .select('costo_unitario')
      .eq('id', existing.resource_id)
      .single()
    costo = (res?.costo_unitario ?? 0) * newUnidades
  }

  const patch: Record<string, unknown> = { unidades: newUnidades }
  if (costo !== undefined) patch.costo = costo
  if (body.user_id !== undefined) patch.user_id = body.user_id

  const { data, error } = await supabase
    .from('schedule_assignments')
    .update(patch)
    .eq('id', assignmentId)
    .select('*, resource:resource_id(*), user:user_id(id,name,email), task:task_id(id,name,wbs)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignment: mapAssignmentToFrontend(data) })
}

// DELETE /api/projects/[id]/assignments/[assignmentId]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const { id, assignmentId } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { error } = await supabase
    .from('schedule_assignments')
    .delete().eq('id', assignmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
