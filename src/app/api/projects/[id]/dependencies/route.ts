import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapDepToFrontend, mapDepInputToDB } from '@/lib/schedule-mappers'
import { wouldCreateCycle, runCPM } from '@/lib/schedule-cpm'
import type { CpmDep } from '@/lib/schedule-cpm'

async function getProjectAndUser(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado', supabase, user: null }
  const { data: project } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  if (!project) return { error: 'Proyecto no encontrado', supabase, user: null }
  return { error: null, supabase, user }
}

/** Carga todas las dependencias del proyecto en formato CpmDep */
async function loadDeps(supabase: ReturnType<typeof createServerSupabase> extends Promise<infer T> ? T : never, projectId: string): Promise<CpmDep[]> {
  const { data } = await supabase
    .from('schedule_dependencies')
    .select('predecesora_id, sucesora_id, tipo, lag')
    .in('predecesora_id',
      supabase.from('project_tasks').select('id').eq('project_id', projectId) as any
    )
  return (data ?? []) as CpmDep[]
}

// GET /api/projects/[id]/dependencies
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, supabase } = await getProjectAndUser(id)
  if (error) return NextResponse.json({ error }, { status: 401 })

  const { data, error: dbErr } = await supabase
    .from('schedule_dependencies')
    .select('*, predecesora:predecesora_id(id,name,wbs), sucesora:sucesora_id(id,name,wbs)')
    .in('predecesora_id',
      supabase.from('project_tasks').select('id').eq('project_id', id) as any
    )

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ dependencies: (data ?? []).map(mapDepToFrontend) })
}

// POST /api/projects/[id]/dependencies
// Body: { predecesora_id | predecessor_id, sucesora_id | successor_id, tipo | type, lag }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, supabase } = await getProjectAndUser(id)
  if (error) return NextResponse.json({ error }, { status: 401 })

  const body = await req.json()
  const input = mapDepInputToDB(body)

  // Validación: campos obligatorios
  if (!input.predecesora_id || !input.sucesora_id) {
    return NextResponse.json(
      { error: 'predecesora_id y sucesora_id son obligatorios' }, { status: 400 }
    )
  }

  // Validación: las tareas pertenecen al proyecto
  const { count } = await supabase
    .from('project_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id)
    .in('id', [input.predecesora_id, input.sucesora_id])

  if (count !== 2) {
    return NextResponse.json(
      { error: 'Las tareas no pertenecen a este proyecto' }, { status: 422 }
    )
  }

  // Validación: detección de ciclo
  const existingDeps = await loadDeps(supabase, id)
  if (wouldCreateCycle(existingDeps, input.predecesora_id, input.sucesora_id)) {
    return NextResponse.json(
      { error: 'Esta dependencia crearía un ciclo en el cronograma', field: 'predecesora_id' },
      { status: 422 }
    )
  }

  // Insertar
  const { data, error: dbErr } = await supabase
    .from('schedule_dependencies')
    .insert(input)
    .select().single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Recalcular fechas y ruta crítica
  await runCPM(supabase, id)

  return NextResponse.json({ dependency: mapDepToFrontend(data) }, { status: 201 })
}

// PATCH /api/projects/[id]/dependencies
// Actualiza lag y/o tipo de una dependencia existente.
// Body: { dep_id, lag?, tipo? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, supabase } = await getProjectAndUser(id)
  if (error) return NextResponse.json({ error }, { status: 401 })

  const body = await req.json()
  const depId = body.dep_id
  if (!depId) return NextResponse.json({ error: 'dep_id requerido' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.lag     !== undefined) patch.lag  = Number(body.lag)
  if (body.tipo    !== undefined) patch.tipo = body.tipo
  if (body.type    !== undefined) patch.tipo = body.type  // alias frontend
  if (body.lag_days !== undefined) patch.lag = Number(body.lag_days)

  if (!['FS', 'SS', 'FF', 'SF'].includes(patch.tipo as string) && patch.tipo !== undefined) {
    return NextResponse.json({ error: 'tipo debe ser FS, SS, FF o SF' }, { status: 400 })
  }

  const { data, error: dbErr } = await supabase
    .from('schedule_dependencies')
    .update(patch)
    .eq('id', depId)
    .select().single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  await runCPM(supabase, id)

  return NextResponse.json({ dependency: mapDepToFrontend(data) })
}

// DELETE /api/projects/[id]/dependencies?dep_id=...
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, supabase } = await getProjectAndUser(id)
  if (error) return NextResponse.json({ error }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const depId = searchParams.get('dep_id')
  if (!depId) return NextResponse.json({ error: 'dep_id requerido' }, { status: 400 })

  await supabase.from('schedule_dependencies').delete().eq('id', depId)

  // Recalcular ruta crítica sin la dependencia eliminada
  await runCPM(supabase, id)

  return NextResponse.json({ ok: true })
}
