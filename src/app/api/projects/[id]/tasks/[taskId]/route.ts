import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapTaskToFrontend, mapTaskPatchToDB } from '@/lib/schedule-mappers'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()
  const patch = { ...mapTaskPatchToDB(body), updated_at: new Date().toISOString() }

  const { data: task, error } = await supabase
    .from('project_tasks')
    .update(patch)
    .eq('id', taskId).eq('project_id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: mapTaskToFrontend(task) })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error } = await supabase
    .from('project_tasks').delete().eq('id', taskId).eq('project_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
