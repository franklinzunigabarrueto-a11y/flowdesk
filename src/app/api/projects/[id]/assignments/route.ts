import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapAssignmentToFrontend, mapAssignmentInputToDB } from '@/lib/schedule-mappers'

async function auth(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ok: false }
  const { data: p } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  return { supabase, user, ok: !!p }
}

// GET /api/projects/[id]/assignments
// Lista todas las asignaciones del proyecto con datos de recurso, usuario y tarea.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data } = await supabase
    .from('schedule_assignments')
    .select(`
      *,
      resource:resource_id ( id, nombre, tipo, costo_unitario ),
      user:user_id          ( id, name, email, avatar_url ),
      task:task_id          ( id, name, wbs, start_date, end_date )
    `)
    .in('task_id', supabase.from('project_tasks').select('id').eq('project_id', id) as any)
    .order('created_at')

  return NextResponse.json({ assignments: (data ?? []).map(mapAssignmentToFrontend) })
}

// POST /api/projects/[id]/assignments
// Crea o actualiza (upsert) una asignación.
// Body: { task_id, resource_id?, user_id?, units | unidades }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const dbInput = mapAssignmentInputToDB(body)

  // Validar que la tarea pertenece al proyecto
  if (!dbInput.task_id) {
    return NextResponse.json({ error: 'task_id es obligatorio', field: 'task_id' }, { status: 400 })
  }
  const { data: taskCheck } = await supabase
    .from('project_tasks').select('id').eq('id', dbInput.task_id).eq('project_id', id).single()
  if (!taskCheck) {
    return NextResponse.json({ error: 'La tarea no pertenece a este proyecto' }, { status: 422 })
  }

  // Validar que al menos resource_id o user_id está presente
  if (!dbInput.resource_id && !dbInput.user_id) {
    return NextResponse.json(
      { error: 'Se requiere resource_id o user_id', field: 'resource_id' },
      { status: 400 },
    )
  }

  // Validar que el recurso pertenece al proyecto
  if (dbInput.resource_id) {
    const { data: resCheck } = await supabase
      .from('schedule_resources').select('id, costo_unitario').eq('id', dbInput.resource_id).eq('project_id', id).single()
    if (!resCheck) {
      return NextResponse.json({ error: 'El recurso no pertenece a este proyecto' }, { status: 422 })
    }
    dbInput.costo = (Number(resCheck.costo_unitario) || 0) * (Number(dbInput.unidades) || 1)
  }

  // Validar que el usuario existe (si se pasa user_id)
  if (dbInput.user_id) {
    const { data: userCheck } = await supabase
      .from('users').select('id').eq('id', dbInput.user_id).single()
    if (!userCheck) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 422 })
    }
  }

  const { data, error } = await supabase
    .from('schedule_assignments')
    .upsert(dbInput, { onConflict: 'task_id,resource_id' })
    .select('*, resource:resource_id(*), user:user_id(id,name,email,avatar_url), task:task_id(id,name,wbs)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignment: mapAssignmentToFrontend(data) }, { status: 201 })
}

// DELETE /api/projects/[id]/assignments?assignment_id=...  (legacy)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const assignmentId = searchParams.get('assignment_id')
  if (!assignmentId) return NextResponse.json({ error: 'assignment_id requerido' }, { status: 400 })

  await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
  return NextResponse.json({ ok: true })
}
