import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapResourceToFrontend, mapResourceInputToDB } from '@/lib/schedule-mappers'

async function auth(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ok: false }
  const { data: p } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  return { supabase, user, ok: !!p }
}

// GET /api/projects/[id]/resources/[resourceId]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const { id, resourceId } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data, error } = await supabase
    .from('schedule_resources')
    .select('*, assignments:schedule_assignments(*, task:task_id(id,name,wbs,start_date,end_date))')
    .eq('id', resourceId).eq('project_id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Recurso no encontrado' }, { status: 404 })
  return NextResponse.json({ resource: mapResourceToFrontend(data) })
}

// PATCH /api/projects/[id]/resources/[resourceId]
// Body: { nombre?, tipo?, costo_unitario? }  (acepta alias inglés también)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const { id, resourceId } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  const tipo = body.tipo ?? body.type
  if (tipo && !['persona', 'equipo', 'material'].includes(tipo)) {
    return NextResponse.json({ error: 'tipo debe ser persona, equipo o material' }, { status: 400 })
  }

  const patch = mapResourceInputToDB(body)
  delete patch.project_id  // no permitir reasignar proyecto

  const { data, error } = await supabase
    .from('schedule_resources')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', resourceId).eq('project_id', id)
    .select().single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'No encontrado' }, { status: 500 })
  return NextResponse.json({ resource: mapResourceToFrontend(data) })
}

// DELETE /api/projects/[id]/resources/[resourceId]
// Elimina el recurso y en cascada sus asignaciones (ON DELETE SET NULL en assignments).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const { id, resourceId } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { error } = await supabase
    .from('schedule_resources')
    .delete().eq('id', resourceId).eq('project_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
