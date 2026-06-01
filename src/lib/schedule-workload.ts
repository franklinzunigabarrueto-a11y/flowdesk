/**
 * schedule-workload.ts
 *
 * Algoritmo de carga de trabajo y detección de sobreasignación.
 *
 * ─── ALGORITMO ───────────────────────────────────────────────────────────────
 * Se usa un "sweep line" sobre el eje del tiempo:
 *
 * 1. Para cada asignación con fechas de tarea, generar dos eventos:
 *      START  (día de inicio inclusivo)
 *      END    (día de fin exclusivo  — el día siguiente al end_date)
 *
 * 2. Ordenar eventos por día (los END antes que START el mismo día,
 *    para que tareas consecutivas no se solapen).
 *
 * 3. Barrer los eventos manteniendo un mapa de asignaciones activas.
 *    En cada transición calcular la suma de unidades activas.
 *    Si sum > capacity → período de sobreasignación.
 *
 * ─── CAPACIDAD ───────────────────────────────────────────────────────────────
 * - tipo 'persona' / 'usuario': capacity = 1.0 FTE
 * - tipo 'equipo':              capacity = 1.0 (solo puede estar en un lugar)
 * - tipo 'material':            capacity = Infinity (no se sobreasigna)
 */

import { dayNum, dayStr } from './schedule-cpm'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface WorkloadItem {
  assignment_id: string
  task_id:       string
  task_name:     string
  task_start:    string | null
  task_end:      string | null
  units:         number
}

export interface OverlapPeriod {
  start:       string
  end:         string          // fecha fin exclusiva
  total_units: number
  task_ids:    string[]
}

export interface WorkloadResult {
  overallocated_periods: OverlapPeriod[]
  is_overallocated:      boolean
  peak_units:            number   // máximo de unidades simultáneas
}

// ─── Capacidad por tipo ───────────────────────────────────────────────────────

export function capacityForType(tipo: string): number {
  if (tipo === 'material') return Infinity
  return 1.0  // persona, equipo, usuario
}

// ─── Algoritmo sweep line ─────────────────────────────────────────────────────

type EventType = 'end' | 'start'  // end antes que start en el mismo día

interface Event {
  day:  number
  type: EventType
  item: WorkloadItem
}

export function computeWorkload(
  items: WorkloadItem[],
  capacity: number,
): WorkloadResult {
  if (capacity === Infinity) {
    return { overallocated_periods: [], is_overallocated: false, peak_units: 0 }
  }

  // Solo incluir asignaciones con fechas en la tarea
  const withDates = items.filter(i => i.task_start && i.task_end)
  if (withDates.length === 0) {
    return { overallocated_periods: [], is_overallocated: false, peak_units: 0 }
  }

  // Construir eventos
  const events: Event[] = []
  for (const item of withDates) {
    events.push({ day: dayNum(item.task_start!), type: 'start', item })
    // END en el día siguiente (end_date es inclusivo en la app)
    events.push({ day: dayNum(item.task_end!) + 1, type: 'end', item })
  }

  // Ordenar: primero por día, luego END antes que START (evita falso solapamiento en días contiguos)
  events.sort((a, b) => a.day !== b.day ? a.day - b.day : a.type.localeCompare(b.type))

  const active = new Map<string, WorkloadItem>()   // assignment_id → item
  const overallocated_periods: OverlapPeriod[] = []
  let prevDay: number | null = null
  let prevTotal = 0
  let peakUnits = 0
  let overStart: number | null = null

  const flush = (toDay: number) => {
    if (prevDay === null || toDay <= prevDay) return
    if (prevTotal > capacity) {
      // Período sobreasignado: [prevDay, toDay)
      const activeTasks = [...active.values()].map(i => i.task_id)
      if (overStart === null) overStart = prevDay
      // Extender o registrar
      if (
        overallocated_periods.length > 0 &&
        overallocated_periods[overallocated_periods.length - 1].end === dayStr(prevDay)
      ) {
        // Continúa el período anterior
        overallocated_periods[overallocated_periods.length - 1].end = dayStr(toDay)
        overallocated_periods[overallocated_periods.length - 1].total_units = prevTotal
        overallocated_periods[overallocated_periods.length - 1].task_ids = activeTasks
      } else {
        overallocated_periods.push({
          start:       dayStr(prevDay),
          end:         dayStr(toDay),
          total_units: prevTotal,
          task_ids:    activeTasks,
        })
      }
    } else {
      overStart = null
    }
  }

  for (const ev of events) {
    flush(ev.day)
    prevDay = ev.day

    if (ev.type === 'start') {
      active.set(ev.item.assignment_id, ev.item)
    } else {
      active.delete(ev.item.assignment_id)
    }

    prevTotal = [...active.values()].reduce((s, i) => s + i.units, 0)
    if (prevTotal > peakUnits) peakUnits = prevTotal
  }

  return {
    overallocated_periods,
    is_overallocated: overallocated_periods.length > 0,
    peak_units:       peakUnits,
  }
}
