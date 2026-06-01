/**
 * Validaciones y utilidades para el submódulo de cronograma.
 * Todas las funciones son puras o reciben supabase como dependencia explícita.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ValidationError = { field: string; message: string }

// ─── Fechas ──────────────────────────────────────────────────────────────────

export function validateDates(
  start?: string | null,
  end?: string | null,
): ValidationError | null {
  if (!start || !end) return null
  if (new Date(start) > new Date(end)) {
    return {
      field: 'end_date',
      message: 'La fecha de término debe ser posterior o igual a la de inicio',
    }
  }
  return null
}

// ─── Ciclos en jerarquía ─────────────────────────────────────────────────────

/**
 * Detecta si asignar `proposedParentId` como padre de `taskId` crearía un ciclo.
 * Sube por la cadena de ancestros de proposedParentId y verifica si taskId aparece.
 */
export async function detectCycle(
  supabase: SupabaseClient,
  taskId: string,
  proposedParentId: string | null,
): Promise<boolean> {
  if (!proposedParentId) return false
  if (proposedParentId === taskId) return true

  let currentId: string | null = proposedParentId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) return true   // ref circular en DB
    visited.add(currentId)
    if (currentId === taskId) return true

    const row: { data: { parent_id: string | null } | null } = await supabase
      .from('project_tasks')
      .select('parent_id')
      .eq('id', currentId)
      .single()

    currentId = row.data?.parent_id ?? null
  }

  return false
}

// ─── Recalcular WBS ──────────────────────────────────────────────────────────

interface TaskRow { id: string; parent_id: string | null; sort_order: number }

/**
 * Recalcula wbs y outline_level de todas las tareas de un proyecto
 * tras cualquier cambio de jerarquía.
 */
export async function recalculateWBS(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('project_tasks')
    .select('id, parent_id, sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error || !data) return

  const tasks = data as TaskRow[]

  // Construir mapa de hijos por padre
  const childrenOf = new Map<string | null, TaskRow[]>()
  for (const t of tasks) {
    const key = t.parent_id ?? null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(t)
  }
  // Ordenar hijos por sort_order
  childrenOf.forEach(arr => arr.sort((a, b) => a.sort_order - b.sort_order))

  const updates: { id: string; wbs: string; outline_level: number }[] = []

  function walk(parentId: string | null, prefix: string, level: number) {
    const children = childrenOf.get(parentId) ?? []
    children.forEach((child, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      updates.push({ id: child.id, wbs, outline_level: level })
      walk(child.id, wbs, level + 1)
    })
  }

  walk(null, '', 1)

  for (const u of updates) {
    await supabase
      .from('project_tasks')
      .update({ wbs: u.wbs, outline_level: u.outline_level })
      .eq('id', u.id)
  }
}

// ─── Helpers de jerarquía ────────────────────────────────────────────────────

/**
 * Devuelve todos los IDs descendientes de una tarea (recursivo).
 * Útil para evitar mover un padre dentro de uno de sus hijos.
 */
export async function getDescendantIds(
  supabase: SupabaseClient,
  taskId: string,
): Promise<Set<string>> {
  const ids = new Set<string>()
  const queue = [taskId]

  while (queue.length) {
    const current = queue.shift()!
    const { data } = await supabase
      .from('project_tasks')
      .select('id')
      .eq('parent_id', current)

    for (const row of (data ?? []) as { id: string }[]) {
      ids.add(row.id)
      queue.push(row.id)
    }
  }

  return ids
}
