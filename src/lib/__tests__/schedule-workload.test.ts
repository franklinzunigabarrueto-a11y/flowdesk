import { describe, it, expect } from 'vitest'
import { computeWorkload, capacityForType } from '../schedule-workload'
import type { WorkloadItem } from '../schedule-workload'

function item(
  id: string,
  taskId: string,
  start: string | null,
  end: string | null,
  units = 1.0,
): WorkloadItem {
  return { assignment_id: id, task_id: taskId, task_name: taskId, task_start: start, task_end: end, units }
}

// ─── capacityForType ──────────────────────────────────────────────────────────

describe('capacityForType', () => {
  it('material → Infinity', () => expect(capacityForType('material')).toBe(Infinity))
  it('persona → 1.0',     () => expect(capacityForType('persona')).toBe(1.0))
  it('equipo → 1.0',      () => expect(capacityForType('equipo')).toBe(1.0))
  it('usuario → 1.0',     () => expect(capacityForType('usuario')).toBe(1.0))
})

// ─── Sin sobreasignación ──────────────────────────────────────────────────────

describe('computeWorkload — sin sobreasignación', () => {
  it('recurso sin asignaciones', () => {
    const result = computeWorkload([], 1.0)
    expect(result.is_overallocated).toBe(false)
    expect(result.overallocated_periods).toHaveLength(0)
  })

  it('una sola asignación no puede sobrepasar capacidad', () => {
    const result = computeWorkload(
      [item('a1', 'T1', '2025-01-01', '2025-01-10', 0.5)],
      1.0,
    )
    expect(result.is_overallocated).toBe(false)
  })

  it('dos tareas consecutivas (no solapan) — T2 empieza el día siguiente', () => {
    // end_date es inclusivo: T1 ocupa Jan5, T2 empieza Jan6 → sin solapamiento
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-05'),
        item('a2', 'T2', '2025-01-06', '2025-01-10'),
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(false)
  })

  it('tareas que comparten el mismo día de inicio/fin SÍ solapan', () => {
    // T1 termina Jan5 (activa ese día), T2 empieza Jan5 → ambas activas el Jan5
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-05'),
        item('a2', 'T2', '2025-01-05', '2025-01-10'),
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(true)
  })

  it('dos tareas sin solapamiento temporal', () => {
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-05'),
        item('a2', 'T2', '2025-01-10', '2025-01-15'),
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(false)
  })

  it('material nunca se sobreasigna', () => {
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-10', 5),
        item('a2', 'T2', '2025-01-01', '2025-01-10', 5),
      ],
      Infinity,
    )
    expect(result.is_overallocated).toBe(false)
  })

  it('dos asignaciones con 0.5u cada una no superan 1.0', () => {
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-10', 0.5),
        item('a2', 'T2', '2025-01-01', '2025-01-10', 0.5),
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(false)
    expect(result.peak_units).toBeCloseTo(1.0)
  })
})

// ─── Con sobreasignación ──────────────────────────────────────────────────────

describe('computeWorkload — con sobreasignación', () => {
  it('dos tareas completas solapadas → sobreasignado', () => {
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-10'),
        item('a2', 'T2', '2025-01-05', '2025-01-15'),
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(true)
    expect(result.overallocated_periods).toHaveLength(1)
    expect(result.overallocated_periods[0].start).toBe('2025-01-05')
    expect(result.overallocated_periods[0].total_units).toBeCloseTo(2.0)
    expect(result.overallocated_periods[0].task_ids).toContain('T1')
    expect(result.overallocated_periods[0].task_ids).toContain('T2')
  })

  it('tres tareas solapadas → peak_units = 3', () => {
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-20'),
        item('a2', 'T2', '2025-01-05', '2025-01-15'),
        item('a3', 'T3', '2025-01-08', '2025-01-12'),
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(true)
    expect(result.peak_units).toBeCloseTo(3.0)
  })

  it('sobreasignación solo en el período solapado', () => {
    // T1: Jan 1–20  (1.0u)
    // T2: Jan 10–15 (0.5u) → total 1.5u en [Jan 10, Jan 15]
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-20', 1.0),
        item('a2', 'T2', '2025-01-10', '2025-01-15', 0.5),
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(true)
    expect(result.overallocated_periods[0].start).toBe('2025-01-10')
    // end es exclusivo: Jan 16 (día siguiente al end_date Jan 15)
    expect(result.overallocated_periods[0].end).toBe('2025-01-16')
  })

  it('tarea sin fecha no contribuye al solapamiento', () => {
    const result = computeWorkload(
      [
        item('a1', 'T1', '2025-01-01', '2025-01-10'),
        item('a2', 'T2', null, null),  // sin fecha → ignorar
      ],
      1.0,
    )
    expect(result.is_overallocated).toBe(false)
  })
})
