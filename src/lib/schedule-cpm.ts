/**
 * schedule-cpm.ts
 *
 * ─── PROPAGACIÓN DE FECHAS ───────────────────────────────────────────────────
 * Cuando cambia una fecha o se crea/edita una dependencia:
 *  1. Ordenar tareas topológicamente (Kahn).
 *  2. Recorrer en orden: para cada tarea calcular su inicio más temprano
 *     según sus predecesoras aplicando el tipo de dependencia y el lag:
 *       FS  → succ_start  = max(succ_start,  pred_end   + lag)
 *       SS  → succ_start  = max(succ_start,  pred_start + lag)
 *       FF  → succ_end    = max(succ_end,    pred_end   + lag)  → start = end - dur
 *       SF  → succ_end    = max(succ_end,    pred_start + lag)  → start = end - dur
 *  3. Solo se empuja hacia adelante (nunca se retroceden fechas).
 *
 * ─── RUTA CRÍTICA (CPM) ──────────────────────────────────────────────────────
 *  1. Forward pass:  ES[i] y EF[i] = ES[i] + dur[i].
 *  2. Backward pass: LF[i] y LS[i] = LF[i] − dur[i].
 *     LF[pred] se restringe por cada sucesor según el tipo de dependencia.
 *  3. Float = LS − ES.  Float ≈ 0  →  tarea en ruta crítica.
 *
 * ─── DETECCIÓN DE CICLOS ─────────────────────────────────────────────────────
 *  DFS desde el sucesor propuesto buscando el predecesor propuesto.
 *  Si se alcanza, agregar esa dependencia crearía un ciclo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface CpmTask {
  id: string
  start_date: string | null
  end_date: string | null
  duracion: number | null
}

export interface CpmDep {
  predecesora_id: string
  sucesora_id: string
  tipo: 'FS' | 'SS' | 'FF' | 'SF'
  lag: number
}

export interface CpmResult {
  /** IDs de tareas en la ruta crítica */
  criticalIds: Set<string>
  /** Fechas recalculadas (solo las que cambian) */
  propagated: Map<string, { start: string; end: string }>
}

// ─── Utilidades de calendario ─────────────────────────────────────────────────

const MS = 86_400_000 // ms por día

/** Convierte 'YYYY-MM-DD' a número de día (días desde epoch) */
export function dayNum(date: string): number {
  return Math.floor(new Date(date + 'T12:00:00Z').getTime() / MS)
}

/** Convierte número de día a 'YYYY-MM-DD' */
export function dayStr(day: number): string {
  return new Date(day * MS).toISOString().slice(0, 10)
}

/** Duración en días de una tarea (mínimo 1) */
export function taskDur(t: CpmTask): number {
  if (t.duracion && t.duracion > 0) return t.duracion
  if (t.start_date && t.end_date) {
    const d = dayNum(t.end_date) - dayNum(t.start_date)
    return Math.max(1, d)
  }
  return 1
}

// ─── Detección de ciclos ──────────────────────────────────────────────────────

/**
 * Retorna true si agregar la dependencia predId → succId crearía un ciclo.
 * Hace DFS desde succId buscando predId en el grafo existente.
 */
export function wouldCreateCycle(
  deps: CpmDep[],
  predId: string,
  succId: string,
): boolean {
  if (predId === succId) return true

  const adj = new Map<string, string[]>()
  for (const d of deps) {
    if (!adj.has(d.predecesora_id)) adj.set(d.predecesora_id, [])
    adj.get(d.predecesora_id)!.push(d.sucesora_id)
  }

  const visited = new Set<string>()
  const stack = [succId]
  while (stack.length) {
    const node = stack.pop()!
    if (node === predId) return true
    if (visited.has(node)) continue
    visited.add(node)
    stack.push(...(adj.get(node) ?? []))
  }
  return false
}

// ─── Orden topológico (Kahn) ──────────────────────────────────────────────────

export function topoSort(taskIds: string[], deps: CpmDep[]): string[] | null {
  const inDeg = new Map<string, number>(taskIds.map(id => [id, 0]))
  const adj   = new Map<string, string[]>(taskIds.map(id => [id, []]))

  for (const d of deps) {
    if (!adj.has(d.predecesora_id) || !adj.has(d.sucesora_id)) continue
    adj.get(d.predecesora_id)!.push(d.sucesora_id)
    inDeg.set(d.sucesora_id, (inDeg.get(d.sucesora_id) ?? 0) + 1)
  }

  const queue = taskIds.filter(id => (inDeg.get(id) ?? 0) === 0)
  const order: string[] = []

  while (queue.length) {
    const node = queue.shift()!
    order.push(node)
    for (const succ of adj.get(node) ?? []) {
      const d = (inDeg.get(succ) ?? 1) - 1
      inDeg.set(succ, d)
      if (d === 0) queue.push(succ)
    }
  }

  return order.length === taskIds.length ? order : null // null = ciclo
}

// ─── Propagación de fechas ────────────────────────────────────────────────────

/**
 * Calcula las fechas mínimas de cada tarea tras aplicar las restricciones
 * de dependencia. Solo empuja hacia adelante.
 *
 * Retorna Map<id, {start, end}> con las fechas recalculadas (incluye
 * todas las tareas con fecha, cambien o no, para facilitar la actualización).
 */
export function propagateDates(
  tasks: CpmTask[],
  deps: CpmDep[],
): Map<string, { start: string; end: string }> {
  const tMap = new Map(tasks.map(t => [t.id, t]))
  const order = topoSort(tasks.map(t => t.id), deps)
  if (!order) return new Map()

  // ES y EF en números de día
  const ES = new Map<string, number>()
  const EF = new Map<string, number>()

  for (const id of order) {
    const t = tMap.get(id)!
    const dur = taskDur(t)
    let es = t.start_date ? dayNum(t.start_date) : null

    const preds = deps.filter(d => d.sucesora_id === id)
    for (const dep of preds) {
      const predES = ES.get(dep.predecesora_id)
      const predEF = EF.get(dep.predecesora_id)
      if (predES === undefined || predEF === undefined) continue

      switch (dep.tipo) {
        case 'FS':
          es = es === null ? predEF + dep.lag : Math.max(es, predEF + dep.lag)
          break
        case 'SS':
          es = es === null ? predES + dep.lag : Math.max(es, predES + dep.lag)
          break
        case 'FF': {
          const minEF = predEF + dep.lag
          const curEF = es !== null ? es + dur : minEF
          const newEF = Math.max(curEF, minEF)
          es = newEF - dur
          break
        }
        case 'SF': {
          const minEF = predES + dep.lag
          const curEF = es !== null ? es + dur : minEF
          const newEF = Math.max(curEF, minEF)
          es = newEF - dur
          break
        }
      }
    }

    if (es === null) {
      // Sin fechas ni predecesoras con fecha: no participar
      continue
    }

    ES.set(id, es)
    EF.set(id, es + dur)
  }

  // Construir resultado
  const result = new Map<string, { start: string; end: string }>()
  for (const [id, es] of ES) {
    result.set(id, { start: dayStr(es), end: dayStr(EF.get(id)!) })
  }
  return result
}

// ─── CPM: ruta crítica ────────────────────────────────────────────────────────

/**
 * Ejecuta CPM completo y devuelve los IDs en ruta crítica.
 * Solo participan tareas que tienen al menos start_date o duracion.
 */
export function computeCriticalPath(
  tasks: CpmTask[],
  deps: CpmDep[],
): Set<string> {
  // Excluir tareas sin ningún dato temporal
  const eligible = tasks.filter(t => t.start_date || t.end_date || t.duracion)
  if (eligible.length === 0 || deps.length === 0) return new Set()

  const tMap = new Map(eligible.map(t => [t.id, t]))
  const ids  = eligible.map(t => t.id)
  const order = topoSort(ids, deps)
  if (!order) return new Set() // ciclo

  // Ancla: mínimo start_date del proyecto
  const anchor = eligible
    .map(t => (t.start_date ? dayNum(t.start_date) : null))
    .filter((d): d is number => d !== null)
    .reduce((a, b) => Math.min(a, b), Infinity)
  const base = isFinite(anchor) ? anchor : 0

  const ES = new Map<string, number>()
  const EF = new Map<string, number>()

  // ── Forward pass ──────────────────────────────────────────────────────────
  for (const id of order) {
    const t = tMap.get(id)
    if (!t) continue
    const dur = taskDur(t)
    let es = t.start_date ? dayNum(t.start_date) : base

    for (const dep of deps.filter(d => d.sucesora_id === id)) {
      const predES = ES.get(dep.predecesora_id)
      const predEF = EF.get(dep.predecesora_id)
      if (predES === undefined || predEF === undefined) continue

      switch (dep.tipo) {
        case 'FS': es = Math.max(es, predEF + dep.lag);  break
        case 'SS': es = Math.max(es, predES + dep.lag);  break
        case 'FF': { const newEF = Math.max(es + dur, predEF + dep.lag); es = newEF - dur; break }
        case 'SF': { const newEF = Math.max(es + dur, predES + dep.lag); es = newEF - dur; break }
      }
    }

    ES.set(id, es)
    EF.set(id, es + dur)
  }

  const projectEnd = Math.max(...Array.from(EF.values()))

  // ── Backward pass ─────────────────────────────────────────────────────────
  const LF = new Map<string, number>()
  const LS = new Map<string, number>()

  for (const id of [...order].reverse()) {
    const t = tMap.get(id)
    if (!t) continue
    const dur = taskDur(t)
    const succs = deps.filter(d => d.predecesora_id === id)

    let lf = succs.length === 0 ? projectEnd : Infinity

    for (const dep of succs) {
      const succLS = LS.get(dep.sucesora_id)
      const succLF = LF.get(dep.sucesora_id)
      if (succLS === undefined || succLF === undefined) continue

      switch (dep.tipo) {
        case 'FS': lf = Math.min(lf, succLS - dep.lag);               break
        case 'SS': lf = Math.min(lf, succLS - dep.lag + dur);         break
        case 'FF': lf = Math.min(lf, succLF - dep.lag);               break
        case 'SF': lf = Math.min(lf, succLF - dep.lag + dur);         break
      }
    }

    if (!isFinite(lf)) lf = projectEnd
    LF.set(id, lf)
    LS.set(id, lf - dur)
  }

  // ── Identificar ruta crítica (float ≈ 0) ─────────────────────────────────
  const critical = new Set<string>()
  for (const id of ids) {
    const float = (LS.get(id) ?? 0) - (ES.get(id) ?? 0)
    if (Math.round(float) === 0) critical.add(id)
  }
  return critical
}

// ─── Integración con Supabase ─────────────────────────────────────────────────

/**
 * Carga tareas y dependencias del proyecto, ejecuta propagación + CPM
 * y persiste los cambios en la DB:
 *  - Actualiza start_date / end_date de las tareas que se deben mover.
 *  - Actualiza en_ruta_critica en todas las tareas.
 */
export async function runCPM(supabase: SupabaseClient, projectId: string): Promise<void> {
  const [{ data: rawTasks }, { data: rawDeps }] = await Promise.all([
    supabase.from('project_tasks').select(
      'id, start_date, end_date, duracion, pct_avance_aprobado'
    ).eq('project_id', projectId),
    supabase.from('schedule_dependencies').select('predecesora_id, sucesora_id, tipo, lag')
      .in('predecesora_id',
        supabase.from('project_tasks').select('id').eq('project_id', projectId) as any
      ),
  ])

  const tasks = (rawTasks ?? []) as CpmTask[]
  const deps  = (rawDeps  ?? []) as CpmDep[]

  // 1. Propagar fechas
  const propagated = propagateDates(tasks, deps)

  // 2. Ruta crítica (sobre fechas ya propagadas)
  const tasksWithUpdatedDates: CpmTask[] = tasks.map(t => {
    const upd = propagated.get(t.id)
    return upd ? { ...t, start_date: upd.start, end_date: upd.end } : t
  })
  const criticalIds = computeCriticalPath(tasksWithUpdatedDates, deps)

  // 3. Persistir cambios
  const now = new Date().toISOString()

  for (const task of tasks) {
    const dateUpd  = propagated.get(task.id)
    const isCrit   = criticalIds.has(task.id)
    const wasAlready = (task as any).en_ruta_critica === isCrit

    const patch: Record<string, unknown> = { en_ruta_critica: isCrit, updated_at: now }
    if (dateUpd) {
      patch.start_date = dateUpd.start
      patch.end_date   = dateUpd.end
    }

    // Evitar write si nada cambió (optimización)
    if (!dateUpd && wasAlready) continue

    await supabase.from('project_tasks').update(patch).eq('id', task.id)
  }
}
