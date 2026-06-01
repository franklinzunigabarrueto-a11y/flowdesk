import { describe, it, expect } from 'vitest'
import {
  wouldCreateCycle,
  topoSort,
  propagateDates,
  computeCriticalPath,
  dayNum,
  dayStr,
  taskDur,
} from '../schedule-cpm'
import type { CpmTask, CpmDep } from '../schedule-cpm'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function task(id: string, start: string | null, end: string | null, dur?: number): CpmTask {
  return { id, start_date: start, end_date: end, duracion: dur ?? null }
}

function dep(predId: string, succId: string, tipo: CpmDep['tipo'] = 'FS', lag = 0): CpmDep {
  return { predecesora_id: predId, sucesora_id: succId, tipo, lag }
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

describe('dayNum / dayStr', () => {
  it('son inversos entre sí', () => {
    const date = '2025-06-01'
    expect(dayStr(dayNum(date))).toBe(date)
  })
})

describe('taskDur', () => {
  it('usa duracion si está definida', () => {
    expect(taskDur(task('a', '2025-01-01', '2025-01-10', 5))).toBe(5)
  })
  it('calcula desde fechas si no hay duracion', () => {
    expect(taskDur(task('a', '2025-01-01', '2025-01-06'))).toBe(5)
  })
  it('devuelve 1 si no hay ningún dato', () => {
    expect(taskDur(task('a', null, null))).toBe(1)
  })
})

// ─── Detección de ciclos ──────────────────────────────────────────────────────

describe('wouldCreateCycle', () => {
  it('detecta auto-dependencia', () => {
    expect(wouldCreateCycle([], 'A', 'A')).toBe(true)
  })

  it('detecta ciclo directo A→B, intentar B→A', () => {
    const deps = [dep('A', 'B')]
    expect(wouldCreateCycle(deps, 'B', 'A')).toBe(true)
  })

  it('detecta ciclo transitivo A→B→C, intentar C→A', () => {
    const deps = [dep('A', 'B'), dep('B', 'C')]
    expect(wouldCreateCycle(deps, 'C', 'A')).toBe(true)
  })

  it('no reporta ciclo en dependencia válida', () => {
    const deps = [dep('A', 'B'), dep('B', 'C')]
    expect(wouldCreateCycle(deps, 'A', 'C')).toBe(false)
  })

  it('no reporta ciclo cuando no hay dependencias', () => {
    expect(wouldCreateCycle([], 'A', 'B')).toBe(false)
  })
})

// ─── Orden topológico ─────────────────────────────────────────────────────────

describe('topoSort', () => {
  it('ordena secuencia lineal A→B→C', () => {
    const order = topoSort(['A', 'B', 'C'], [dep('A', 'B'), dep('B', 'C')])
    expect(order).toEqual(['A', 'B', 'C'])
  })

  it('devuelve null ante ciclo', () => {
    const order = topoSort(['A', 'B'], [dep('A', 'B'), dep('B', 'A')])
    expect(order).toBeNull()
  })

  it('maneja nodos sin dependencias', () => {
    const order = topoSort(['A', 'B', 'C'], [])
    expect(order).toHaveLength(3)
  })
})

// ─── Propagación de fechas ────────────────────────────────────────────────────

describe('propagateDates', () => {
  it('FS sin lag: sucesor empieza cuando termina predecesor', () => {
    // A: 1 Jan → 5 Jan (4 días). B debe empezar >= 5 Jan
    const tasks = [
      task('A', '2025-01-01', '2025-01-05'),
      task('B', '2025-01-03', '2025-01-07'), // conflicto: empieza antes que termine A
    ]
    const result = propagateDates(tasks, [dep('A', 'B', 'FS', 0)])
    const b = result.get('B')!
    expect(b.start).toBe('2025-01-05')
    expect(b.end).toBe('2025-01-09') // 4 días de duración
  })

  it('FS con lag positivo', () => {
    const tasks = [
      task('A', '2025-01-01', '2025-01-05'),
      task('B', '2025-01-01', '2025-01-05'),
    ]
    const result = propagateDates(tasks, [dep('A', 'B', 'FS', 2)])
    const b = result.get('B')!
    expect(b.start).toBe('2025-01-07') // A termina día 5, +2 lag = día 7
  })

  it('SS: sucesor empieza cuando empieza predecesor + lag', () => {
    const tasks = [
      task('A', '2025-01-01', '2025-01-05'),
      task('B', '2025-01-01', '2025-01-05'),
    ]
    const result = propagateDates(tasks, [dep('A', 'B', 'SS', 1)])
    const b = result.get('B')!
    expect(b.start).toBe('2025-01-02') // A empieza día 1, +1 = día 2
  })

  it('FF: sucesor termina cuando termina predecesor + lag', () => {
    const tasks = [
      task('A', '2025-01-01', '2025-01-10'), // dur=9
      task('B', '2025-01-01', '2025-01-05'), // dur=4
    ]
    const result = propagateDates(tasks, [dep('A', 'B', 'FF', 0)])
    const b = result.get('B')!
    expect(b.end).toBe('2025-01-10')    // B termina cuando A termina
    expect(b.start).toBe('2025-01-06') // B.end - B.dur(4) = Jan 6
  })

  it('no retrocede fechas de sucesores ya adelantados', () => {
    // B ya empieza después que termina A → no debe moverse
    const tasks = [
      task('A', '2025-01-01', '2025-01-05'),
      task('B', '2025-01-10', '2025-01-15'),
    ]
    const result = propagateDates(tasks, [dep('A', 'B', 'FS', 0)])
    expect(result.get('B')!.start).toBe('2025-01-10') // sin cambio
  })

  it('propaga en cadena A→B→C', () => {
    const tasks = [
      task('A', '2025-01-01', '2025-01-05'),
      task('B', '2025-01-01', '2025-01-03'), // dur=2, conflicto
      task('C', '2025-01-01', '2025-01-03'), // dur=2, conflicto
    ]
    const result = propagateDates(tasks, [dep('A', 'B'), dep('B', 'C')])
    expect(result.get('B')!.start).toBe('2025-01-05')
    expect(result.get('C')!.start).toBe('2025-01-07') // B termina Jan 7
  })
})

// ─── Ruta crítica ─────────────────────────────────────────────────────────────

describe('computeCriticalPath', () => {
  it('sin dependencias no hay ruta crítica', () => {
    const tasks = [task('A', '2025-01-01', '2025-01-05')]
    const result = computeCriticalPath(tasks, [])
    expect(result.size).toBe(0)
  })

  it('cadena lineal A→B→C: todos son críticos', () => {
    // Sin holgura posible en cadena lineal
    const tasks = [
      task('A', '2025-01-01', '2025-01-05'), // dur=4
      task('B', '2025-01-05', '2025-01-09'), // dur=4
      task('C', '2025-01-09', '2025-01-13'), // dur=4
    ]
    const result = computeCriticalPath(tasks, [dep('A', 'B'), dep('B', 'C')])
    expect(result.has('A')).toBe(true)
    expect(result.has('B')).toBe(true)
    expect(result.has('C')).toBe(true)
  })

  it('rama paralela: identifica el camino más largo', () => {
    // A(4d) → C
    // B(1d) → C   (B tiene holgura, no es crítico)
    const tasks = [
      task('A', '2025-01-01', '2025-01-05'), // dur=4
      task('B', '2025-01-01', '2025-01-02'), // dur=1
      task('C', '2025-01-05', '2025-01-07'), // dur=2
    ]
    const result = computeCriticalPath(tasks, [dep('A', 'C'), dep('B', 'C')])
    expect(result.has('A')).toBe(true)
    expect(result.has('C')).toBe(true)
    expect(result.has('B')).toBe(false) // B tiene holgura de 3 días
  })

  it('lag positivo en FS extiende la ruta crítica', () => {
    const tasks = [
      task('A', '2025-01-01', '2025-01-03'), // dur=2
      task('B', '2025-01-05', '2025-01-07'), // dur=2, empieza tras A + 2 lag
    ]
    const result = computeCriticalPath(tasks, [dep('A', 'B', 'FS', 2)])
    expect(result.has('A')).toBe(true)
    expect(result.has('B')).toBe(true)
  })
})
