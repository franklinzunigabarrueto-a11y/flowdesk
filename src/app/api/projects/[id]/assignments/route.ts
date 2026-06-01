import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapAssignmentToFrontend, mapAssignmentInputToDB } from '@/lib/schedule-mappers'

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
    .from('schedule_assignments')
    .select('*, resource:resource_id(*), task:task_id(id,name,wbs)')
    .in('task_id', supabase.from('project_tasks').select('id').eq('project_id', id) as any)

  return NextResponse.json({ assignments: (data ?? []).map(mapAssignmentToFrontend) })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const dbInput = mapAssignmentInputToDB(body)

  const resource = await supabase
    .from('schedule_resources')
    .select('costo_unitario')
    .eq('id', dbInput.resource_id)
    .single()

  const costo = (resource.data?.costo_unitario ?? 0) * (dbInput.unidades ?? 1)

  const { data, error } = await supabase
    .from('schedule_assignments')
    .upsert({ ...dbInput, costo }, { onConflict: 'task_id,resource_id' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignment: mapAssignmentToFrontend(data) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  await supabase.from('schedule_assignments').delete().eq('id', searchParams.get('assignment_id')!)
  return NextResponse.json({ ok: true })
}
