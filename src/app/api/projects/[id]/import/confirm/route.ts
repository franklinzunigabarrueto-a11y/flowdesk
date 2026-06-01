/**
 * POST /api/projects/[id]/import/confirm
 *
 * Importa al proyecto el resultado parseado de un archivo MS Project XML o CSV.
 * El parseo ocurre en el cliente; este endpoint solo persiste en la DB.
 *
 * Body:
 * {
 *   mode: 'replace' | 'merge'          // replace = borra tareas existentes
 *   tasks:        ParsedTask[]
 *   dependencies: ParsedDependency[]
 *   resources:    ParsedResource[]
 *   assignments:  ParsedAssignment[]
 * }
 *
 * Estrategia de inserción:
 *  1. Asignar UUIDs reales a cada tarea (manteniendo el mapeo uid → uuid).
 *  2. Resolver parent_id usando el mapa uid → uuid.
 *  3. Insertar tareas nivel a nivel (outline_level ASC) para respetar FK.
 *  4. Insertar dependencias usando el mapa de UUIDs.
 *  5. Insertar recursos y asignaciones.
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import type { ParsedTask, ParsedDependency, ParsedResource, ParsedAssignment } from '@/lib/msproject-parser'

interface ImportBody {
  mode:         'replace' | 'merge'
  tasks:        ParsedTask[]
  dependencies: ParsedDependency[]
  resources:    ParsedResource[]
  assignments:  ParsedAssignment[]
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar propiedad del proyecto
  const { data: project } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body: ImportBody = await req.json()
  const { mode, tasks, dependencies, resources, assignments } = body

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: 'No hay tareas para importar' }, { status: 400 })
  }

  // ── 1. Reemplazar o preservar tareas existentes ─────────────────────────────
  if (mode === 'replace') {
    await supabase.from('project_tasks').delete().eq('project_id', projectId)
  }

  // ── 2. Asignar UUIDs y construir mapa uid (MSP) → uuid (DB) ────────────────
  const { data: uuids } = await supabase.rpc('generate_uuids', { count: tasks.length }).select()
  // Fallback si la función RPC no existe: usar crypto
  const newUuids: string[] = uuids?.map((r: any) => r.uuid) ??
    tasks.map(() => crypto.randomUUID())

  const uidMap = new Map<string, string>()  // MSP UID → DB UUID
  tasks.forEach((t, i) => uidMap.set(t.uid, newUuids[i]))

  // ── 3. Insertar tareas nivel a nivel ─────────────────────────────────────────
  const maxLevel = Math.max(...tasks.map(t => t.outline_level), 1)

  const insertedIds = new Set<string>()

  for (let level = 1; level <= maxLevel; level++) {
    const levelTasks = tasks.filter(t => t.outline_level === level)
    if (levelTasks.length === 0) continue

    const rows = levelTasks.map(t => {
      const parentId = t.parent_uid ? uidMap.get(t.parent_uid) ?? null : null
      const status   = t.pct_avance >= 100 ? 'completed' : t.pct_avance > 0 ? 'in_progress' : 'pending'

      return {
        id:                   uidMap.get(t.uid),
        project_id:           projectId,
        parent_id:            parentId,
        name:                 t.name,
        wbs:                  t.wbs,
        outline_level:        t.outline_level,
        start_date:           t.start_date,
        end_date:             t.end_date,
        duracion:             t.duracion,
        pct_avance_propuesto: t.pct_avance,
        pct_avance_aprobado:  0,
        progress:             t.pct_avance,
        status,
        es_hito:              t.es_hito,
        en_ruta_critica:      t.en_ruta_critica,
        is_summary:           t.is_summary,
        sort_order:           t.sort_order,
      }
    })

    const { error } = await supabase.from('project_tasks').insert(rows)
    if (error) {
      return NextResponse.json({ error: `Error al insertar tareas nivel ${level}: ${error.message}` }, { status: 500 })
    }

    levelTasks.forEach(t => insertedIds.add(t.uid))
  }

  // ── 4. Insertar dependencias ─────────────────────────────────────────────────
  const depRows = dependencies
    .filter(d => uidMap.has(d.pred_uid) && uidMap.has(d.succ_uid))
    .map(d => ({
      predecesora_id: uidMap.get(d.pred_uid),
      sucesora_id:    uidMap.get(d.succ_uid),
      tipo:           d.tipo,
      lag:            d.lag,
    }))

  if (depRows.length > 0) {
    const { error } = await supabase.from('schedule_dependencies').insert(depRows)
    if (error) console.warn('[import] deps error:', error.message)
  }

  // ── 5. Insertar recursos ─────────────────────────────────────────────────────
  const resUidMap = new Map<string, string>()  // MSP resource UID → DB UUID

  if (resources.length > 0) {
    const resRows = resources.map(r => ({
      project_id:     projectId,
      nombre:         r.nombre,
      tipo:           r.tipo,
      costo_unitario: r.costo_unitario,
    }))

    const { data: insertedRes, error } = await supabase
      .from('schedule_resources').insert(resRows).select('id')

    if (!error && insertedRes) {
      resources.forEach((r, i) => resUidMap.set(r.uid, insertedRes[i].id))
    }
  }

  // ── 6. Insertar asignaciones ─────────────────────────────────────────────────
  const assignRows = assignments
    .filter(a => uidMap.has(a.task_uid) && resUidMap.has(a.resource_uid))
    .map(a => ({
      task_id:     uidMap.get(a.task_uid),
      resource_id: resUidMap.get(a.resource_uid),
      unidades:    a.unidades,
      costo:       0,
    }))

  if (assignRows.length > 0) {
    await supabase.from('schedule_assignments').insert(assignRows)
  }

  return NextResponse.json({
    ok: true,
    imported: {
      tasks:        tasks.length,
      dependencies: depRows.length,
      resources:    resources.length,
      assignments:  assignRows.length,
    },
  })
}
