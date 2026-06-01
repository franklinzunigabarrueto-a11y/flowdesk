import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapDepToFrontend, mapDepInputToDB } from '@/lib/schedule-mappers'

async function getProjectAndUser(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado', supabase, user: null }
  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  if (!project) return { error: 'Proyecto no encontrado', supabase, user: null }
  return { error: null, supabase, user }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, supabase } = await getProjectAndUser(id)
  if (error) return NextResponse.json({ error }, { status: 401 })

  const { data, error: dbErr } = await supabase
    .from('schedule_dependencies')
    .select('*, predecesora:predecesora_id(id,name,wbs), sucesora:sucesora_id(id,name,wbs)')
    .in('predecesora_id', supabase.from('project_tasks').select('id').eq('project_id', id) as any)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ dependencies: (data ?? []).map(mapDepToFrontend) })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, supabase } = await getProjectAndUser(id)
  if (error) return NextResponse.json({ error }, { status: 401 })

  const body = await req.json()
  const { data, error: dbErr } = await supabase
    .from('schedule_dependencies')
    .insert(mapDepInputToDB(body))
    .select().single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ dependency: mapDepToFrontend(data) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, supabase } = await getProjectAndUser(id)
  if (error) return NextResponse.json({ error }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const depId = searchParams.get('dep_id')
  if (!depId) return NextResponse.json({ error: 'dep_id requerido' }, { status: 400 })

  await supabase.from('schedule_dependencies').delete().eq('id', depId)
  return NextResponse.json({ ok: true })
}
