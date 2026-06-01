import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapBaselineToFrontend } from '@/lib/schedule-mappers'

async function auth(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false }
  const { data: p } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  return { supabase, ok: !!p }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data } = await supabase
    .from('schedule_baselines')
    .select('*')
    .eq('project_id', id)
    .order('fecha_creacion', { ascending: false })

  return NextResponse.json({ baselines: (data ?? []).map(mapBaselineToFrontend) })
}

// Crea baseline: snapshot automático de tareas + dependencias del proyecto
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const nombre = body.nombre ?? body.name ?? 'Línea base'

  const { data: tasks } = await supabase.from('project_tasks').select('*').eq('project_id', id)
  const { data: deps } = await supabase
    .from('schedule_dependencies')
    .select('*')
    .in('predecesora_id', supabase.from('project_tasks').select('id').eq('project_id', id) as any)

  const { data, error } = await supabase
    .from('schedule_baselines')
    .insert({ project_id: id, nombre, snapshot: { tasks: tasks ?? [], dependencies: deps ?? [] } })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ baseline: mapBaselineToFrontend(data) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  await supabase.from('schedule_baselines').delete().eq('id', searchParams.get('baseline_id')!).eq('project_id', id)
  return NextResponse.json({ ok: true })
}
