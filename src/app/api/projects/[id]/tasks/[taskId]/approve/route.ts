import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// El dueño del proyecto aprueba o rechaza el avance propuesto
export async function POST(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id: projectId, taskId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  // accepts { action, comment } (frontend) or { accion, comentario } (DB)
  const accion     = body.accion     ?? body.action
  const comentario = body.comentario ?? body.comment ?? null

  if (accion !== 'aprueba' && accion !== 'rechaza' && accion !== 'approve' && accion !== 'reject') {
    return NextResponse.json({ error: 'accion debe ser "aprueba"/"approve" o "rechaza"/"reject"' }, { status: 400 })
  }

  const isApprove = accion === 'aprueba' || accion === 'approve'

  const { data: task } = await supabase
    .from('project_tasks').select('pct_avance_propuesto').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  const taskUpdate = isApprove
    ? { status: 'approved', pct_avance_aprobado: task.pct_avance_propuesto, updated_at: new Date().toISOString() }
    : { status: 'rejected', updated_at: new Date().toISOString() }

  await supabase.from('project_tasks').update(taskUpdate).eq('id', taskId)

  await supabase.from('schedule_approval_logs').insert({
    task_id: taskId,
    user_id: user.id,
    accion: isApprove ? 'aprueba' : 'rechaza',
    comentario,
  })

  return NextResponse.json({ ok: true })
}
