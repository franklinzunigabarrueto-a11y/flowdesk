import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapResourceToFrontend, mapResourceInputToDB } from '@/lib/schedule-mappers'

async function auth(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ok: false }
  const { data: p } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  return { supabase, user, ok: !!p }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data } = await supabase
    .from('schedule_resources')
    .select('*, assignments:schedule_assignments(*)')
    .eq('project_id', id)
    .order('created_at')

  return NextResponse.json({ resources: (data ?? []).map(mapResourceToFrontend) })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('schedule_resources')
    .insert({ ...mapResourceInputToDB(body), project_id: id })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resource: mapResourceToFrontend(data) })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const { resourceId, ...rest } = body
  const { data, error } = await supabase
    .from('schedule_resources')
    .update({ ...mapResourceInputToDB(rest), updated_at: new Date().toISOString() })
    .eq('id', resourceId).eq('project_id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resource: mapResourceToFrontend(data) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  await supabase.from('schedule_resources').delete().eq('id', searchParams.get('resource_id')!).eq('project_id', id)
  return NextResponse.json({ ok: true })
}
