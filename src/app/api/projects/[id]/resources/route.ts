import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapResourceToFrontend, mapResourceInputToDB } from '@/lib/schedule-mappers'

const VALID_TIPOS = ['persona', 'equipo', 'material'] as const

async function auth(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ok: false }
  const { data: p } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  return { supabase, user, ok: !!p }
}

// GET /api/projects/[id]/resources
// Lista recursos con sus asignaciones (id, tarea, unidades, costo).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data } = await supabase
    .from('schedule_resources')
    .select('*, assignments:schedule_assignments(id, unidades, costo, task:task_id(id,name,wbs))')
    .eq('project_id', id)
    .order('created_at')

  return NextResponse.json({ resources: (data ?? []).map(mapResourceToFrontend) })
}

// POST /api/projects/[id]/resources
// Body: { nombre | name, tipo | type, costo_unitario | cost_per_unit }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  const nombre = body.nombre ?? body.name
  const tipo   = body.tipo   ?? body.type

  if (!nombre?.trim()) {
    return NextResponse.json({ error: 'nombre es obligatorio', field: 'nombre' }, { status: 400 })
  }
  if (!VALID_TIPOS.includes(tipo)) {
    return NextResponse.json(
      { error: `tipo debe ser uno de: ${VALID_TIPOS.join(', ')}`, field: 'tipo' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('schedule_resources')
    .insert({ ...mapResourceInputToDB(body), project_id: id })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resource: mapResourceToFrontend(data) }, { status: 201 })
}

// PATCH /api/projects/[id]/resources  (actualización por body.resourceId — legacy)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const { resourceId, ...rest } = body

  if (!resourceId) return NextResponse.json({ error: 'resourceId requerido' }, { status: 400 })

  const tipo = rest.tipo ?? rest.type
  if (tipo && !VALID_TIPOS.includes(tipo)) {
    return NextResponse.json({ error: `tipo debe ser: ${VALID_TIPOS.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('schedule_resources')
    .update({ ...mapResourceInputToDB(rest), updated_at: new Date().toISOString() })
    .eq('id', resourceId).eq('project_id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resource: mapResourceToFrontend(data) })
}

// DELETE /api/projects/[id]/resources?resource_id=...  (legacy query param)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const resourceId = searchParams.get('resource_id')
  if (!resourceId) return NextResponse.json({ error: 'resource_id requerido' }, { status: 400 })

  await supabase.from('schedule_resources').delete().eq('id', resourceId).eq('project_id', id)
  return NextResponse.json({ ok: true })
}
