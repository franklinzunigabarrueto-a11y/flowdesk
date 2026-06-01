import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapLogToFrontend } from '@/lib/schedule-mappers'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('schedule_approval_logs')
    .select('*, user:user_id(name,email)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ logs: (data ?? []).map(mapLogToFrontend) })
}

// El ejecutor reporta avance → tarea pasa a 'in_review'
export async function POST(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  // accepts { progress, comment } (frontend names) or { pct_avance, comentario } (DB names)
  const pctAvance  = body.pct_avance  ?? body.progress  ?? 0
  const comentario = body.comentario  ?? body.comment    ?? null

  await supabase.from('project_tasks').update({
    pct_avance_propuesto: pctAvance,
    status: 'in_review',
    updated_at: new Date().toISOString(),
  }).eq('id', taskId)

  await supabase.from('schedule_approval_logs').insert({
    task_id: taskId,
    user_id: user.id,
    accion: 'reporta',
    comentario,
  })

  return NextResponse.json({ ok: true })
}
