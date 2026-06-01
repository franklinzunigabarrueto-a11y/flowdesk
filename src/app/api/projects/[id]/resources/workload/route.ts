/**
 * GET /api/projects/[id]/resources/workload
 *
 * Devuelve la carga de trabajo de cada recurso y usuario asignado al proyecto,
 * incluyendo la detección de sobreasignación por solapamiento de tareas.
 *
 * Respuesta:
 * {
 *   workload: [
 *     {
 *       type: 'resource' | 'user',
 *       resource?: { id, nombre, tipo, costo_unitario },
 *       user?:     { id, name, email },
 *       assignments: [{ assignment_id, task_id, task_name, task_start, task_end, units }],
 *       total_cost: number,
 *       peak_units: number,
 *       is_overallocated: boolean,
 *       overallocated_periods: [{ start, end, total_units, task_ids }]
 *     }
 *   ]
 * }
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { computeWorkload, capacityForType } from '@/lib/schedule-workload'
import type { WorkloadItem } from '@/lib/schedule-workload'

async function auth(projectId: string) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, ok: false }
  const { data: p } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  return { supabase, user, ok: !!p }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { ok, supabase } = await auth(id)
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // Cargar todas las asignaciones del proyecto con datos de tarea y recurso/usuario
  const { data: rawAssignments, error } = await supabase
    .from('schedule_assignments')
    .select(`
      id,
      unidades,
      costo,
      resource_id,
      user_id,
      resource:resource_id ( id, nombre, tipo, costo_unitario ),
      user:user_id         ( id, name, email ),
      task:task_id         ( id, name, start_date, end_date )
    `)
    .in(
      'task_id',
      supabase.from('project_tasks').select('id').eq('project_id', id) as any,
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const assignments = (rawAssignments ?? []) as any[]

  // ── Agrupar por recurso ───────────────────────────────────────────────────
  const resourceGroups = new Map<string, { resource: any; items: WorkloadItem[]; total_cost: number }>()

  for (const a of assignments.filter(a => a.resource_id)) {
    const rid = a.resource_id
    if (!resourceGroups.has(rid)) {
      resourceGroups.set(rid, { resource: a.resource, items: [], total_cost: 0 })
    }
    const g = resourceGroups.get(rid)!
    g.total_cost += a.costo ?? 0
    g.items.push({
      assignment_id: a.id,
      task_id:       a.task?.id    ?? '',
      task_name:     a.task?.name  ?? '',
      task_start:    a.task?.start_date ?? null,
      task_end:      a.task?.end_date   ?? null,
      units:         a.unidades ?? 1,
    })
  }

  // ── Agrupar por usuario ───────────────────────────────────────────────────
  const userGroups = new Map<string, { user: any; items: WorkloadItem[]; total_cost: number }>()

  for (const a of assignments.filter(a => a.user_id && !a.resource_id)) {
    const uid = a.user_id
    if (!userGroups.has(uid)) {
      userGroups.set(uid, { user: a.user, items: [], total_cost: 0 })
    }
    const g = userGroups.get(uid)!
    g.total_cost += a.costo ?? 0
    g.items.push({
      assignment_id: a.id,
      task_id:       a.task?.id    ?? '',
      task_name:     a.task?.name  ?? '',
      task_start:    a.task?.start_date ?? null,
      task_end:      a.task?.end_date   ?? null,
      units:         a.unidades ?? 1,
    })
  }

  // ── Calcular carga de trabajo ─────────────────────────────────────────────
  const workload = []

  for (const [, g] of resourceGroups) {
    const tipo = g.resource?.tipo ?? 'persona'
    const capacity = capacityForType(tipo)
    const { overallocated_periods, is_overallocated, peak_units } = computeWorkload(g.items, capacity)

    workload.push({
      type:                 'resource',
      resource:             g.resource ? {
        id:             g.resource.id,
        nombre:         g.resource.nombre,
        tipo:           g.resource.tipo,
        costo_unitario: g.resource.costo_unitario,
        // aliases frontend
        name:           g.resource.nombre,
        cost_per_unit:  g.resource.costo_unitario,
      } : null,
      user:                 null,
      assignments:          g.items,
      total_cost:           g.total_cost,
      peak_units,
      is_overallocated,
      overallocated_periods,
    })
  }

  for (const [, g] of userGroups) {
    const { overallocated_periods, is_overallocated, peak_units } = computeWorkload(g.items, 1.0)

    workload.push({
      type:                 'user',
      resource:             null,
      user:                 g.user,
      assignments:          g.items,
      total_cost:           g.total_cost,
      peak_units,
      is_overallocated,
      overallocated_periods,
    })
  }

  const overallocated_count = workload.filter(w => w.is_overallocated).length

  return NextResponse.json({ workload, overallocated_count })
}
