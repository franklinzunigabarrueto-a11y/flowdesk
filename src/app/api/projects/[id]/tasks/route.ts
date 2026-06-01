import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapTaskToFrontend, mapTaskPatchToDB } from '@/lib/schedule-mappers'

async function ownsProject(supabase: Awaited<ReturnType<typeof createServerSupabase>>, projectId: string, userId: string) {
  const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId).single()
  return !!data
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!await ownsProject(supabase, id, user.id)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data: tasks, error } = await supabase
    .from('project_tasks').select('*').eq('project_id', id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: (tasks ?? []).map(mapTaskToFrontend), isAdmin: true })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!await ownsProject(supabase, id, user.id)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json()

  // Bulk import from XML
  if (Array.isArray(body.tasks)) {
    await supabase.from('project_tasks').delete().eq('project_id', id)
    const rows = body.tasks.map((t: Record<string, unknown>, i: number) => ({
      ...mapTaskPatchToDB(t),
      project_id: id,
      sort_order: i,
    }))
    const { data, error } = await supabase.from('project_tasks').insert(rows).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tasks: (data ?? []).map(mapTaskToFrontend) })
  }

  // Single task
  const { data: task, error } = await supabase
    .from('project_tasks')
    .insert({ ...mapTaskPatchToDB(body), project_id: id })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: mapTaskToFrontend(task) })
}
