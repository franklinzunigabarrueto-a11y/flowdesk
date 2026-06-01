import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { mapTaskToFrontend, mapTaskPatchToDB } from '@/lib/schedule-mappers'
import { validateDates, recalculateWBS } from '@/lib/schedule-validators'

async function ownsProject(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  projectId: string,
  userId: string,
) {
  const { data } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', userId).single()
  return !!data
}

// GET /api/projects/[id]/tasks
// Lista todas las tareas del proyecto ordenadas por sort_order.
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

// POST /api/projects/[id]/tasks
// Crea una tarea o importa en bulk desde XML.
// Body single: { name, parent_id?, start_date?, end_date?, ... }
// Body bulk:   { tasks: [...] }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!await ownsProject(supabase, id, user.id)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json()

  // ── Bulk import ────────────────────────────────────────────────────────────
  if (Array.isArray(body.tasks)) {
    await supabase.from('project_tasks').delete().eq('project_id', id)
    const rows = body.tasks.map((t: Record<string, unknown>, i: number) => ({
      ...mapTaskPatchToDB(t),
      project_id: id,
      sort_order: i,
    }))
    const { data, error } = await supabase.from('project_tasks').insert(rows).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // No se recalcula WBS en bulk import: vienen con wbs del XML
    return NextResponse.json({ tasks: (data ?? []).map(mapTaskToFrontend) })
  }

  // ── Single task ────────────────────────────────────────────────────────────
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const dateErr = validateDates(body.start_date, body.end_date)
  if (dateErr) return NextResponse.json({ error: dateErr.message, field: dateErr.field }, { status: 422 })

  // sort_order: al final de sus hermanos
  const { count } = await supabase
    .from('project_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id)
    .eq('parent_id', body.parent_id ?? null)

  const { data: task, error } = await supabase
    .from('project_tasks')
    .insert({
      ...mapTaskPatchToDB(body),
      project_id: id,
      sort_order: count ?? 0,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalcular WBS tras insertar
  await recalculateWBS(supabase, id)

  // Devolver la tarea con WBS actualizado
  const { data: updated } = await supabase
    .from('project_tasks').select('*').eq('id', task.id).single()

  return NextResponse.json({ task: mapTaskToFrontend(updated ?? task) }, { status: 201 })
}

// PATCH /api/projects/[id]/tasks
// Reordena múltiples tareas en una sola llamada (drag & drop).
// Body: { reorder: [{ id: string, sort_order: number }] }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!await ownsProject(supabase, id, user.id)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json()

  if (!Array.isArray(body.reorder) || body.reorder.length === 0) {
    return NextResponse.json({ error: 'Se requiere el campo reorder: [{ id, sort_order }]' }, { status: 400 })
  }

  const items = body.reorder as { id: string; sort_order: number }[]

  for (const item of items) {
    if (!item.id || typeof item.sort_order !== 'number') {
      return NextResponse.json({ error: 'Cada entrada necesita id y sort_order' }, { status: 400 })
    }
    await supabase
      .from('project_tasks')
      .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
      .eq('id', item.id).eq('project_id', id)
  }

  await recalculateWBS(supabase, id)
  return NextResponse.json({ ok: true, updated: items.length })
}
