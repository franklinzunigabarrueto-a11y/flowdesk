/**
 * GET /api/projects/[id]/export/excel
 *
 * Exporta el cronograma completo como workbook Excel (.xlsx) con 4 hojas:
 *  1. Cronograma  — todas las tareas con sus campos
 *  2. Dependencias — relaciones entre tareas
 *  3. Recursos    — recursos y asignaciones
 *  4. Dashboard   — resumen ejecutivo calculado
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

const STATUS_ES: Record<string, string> = {
  pending:     'Pendiente',
  in_progress: 'En progreso',
  in_review:   'En revisión',
  approved:    'Aprobada',
  rejected:    'Rechazada',
  completed:   'Completada',
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // ── Cargar datos ─────────────────────────────────────────────────────────────
  const [{ data: tasks }, { data: deps }, { data: resources }, { data: assignments }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('project_id', id).order('sort_order'),
    supabase.from('schedule_dependencies')
      .select('*, pred:predecesora_id(name,wbs), succ:sucesora_id(name,wbs)')
      .in('predecesora_id', supabase.from('project_tasks').select('id').eq('project_id', id) as any),
    supabase.from('schedule_resources').select('*').eq('project_id', id),
    supabase.from('schedule_assignments')
      .select('*, resource:resource_id(nombre,tipo), task:task_id(name,wbs)')
      .in('task_id', supabase.from('project_tasks').select('id').eq('project_id', id) as any),
  ])

  const wb = XLSX.utils.book_new()
  const today = new Date()

  // ── Hoja 1: Cronograma ────────────────────────────────────────────────────────
  const taskRows = (tasks ?? []).map(t => ({
    'EDT (WBS)':             t.wbs ?? '',
    'Nombre':                t.name,
    'Nivel':                 t.outline_level,
    'Inicio':                t.start_date ?? '',
    'Fin':                   t.end_date   ?? '',
    'Duración (días)':       t.duracion ?? (t.start_date && t.end_date
      ? Math.round((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86_400_000) : ''),
    '% Avance Aprobado':     t.pct_avance_aprobado  ?? 0,
    '% Avance Propuesto':    t.pct_avance_propuesto ?? 0,
    'Estado':                STATUS_ES[t.status] ?? t.status,
    'Es Hito':               t.es_hito          ? 'Sí' : 'No',
    'Es Resumen':            t.is_summary       ? 'Sí' : 'No',
    'Ruta Crítica':          t.en_ruta_critica  ? 'Sí' : 'No',
    'Inicio Línea Base':     t.baseline_start   ?? '',
    'Fin Línea Base':        t.baseline_end     ?? '',
    '% Línea Base':          t.baseline_progress ?? '',
    'Desviación Fin (días)': t.end_date && t.baseline_end
      ? Math.round((new Date(t.end_date).getTime() - new Date(t.baseline_end).getTime()) / 86_400_000)
      : '',
  }))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), 'Cronograma')

  // ── Hoja 2: Dependencias ──────────────────────────────────────────────────────
  const depRows = (deps ?? []).map((d: any) => ({
    'EDT Predecesora': d.pred?.wbs ?? '',
    'Predecesora':     d.pred?.name ?? d.predecesora_id,
    'Tipo':            d.tipo,
    'Lag (días)':      d.lag,
    'EDT Sucesora':    d.succ?.wbs ?? '',
    'Sucesora':        d.succ?.name ?? d.sucesora_id,
  }))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(depRows.length ? depRows : [{ 'Info': 'Sin dependencias' }]), 'Dependencias')

  // ── Hoja 3: Recursos y Asignaciones ──────────────────────────────────────────
  const resRows = (resources ?? []).map((r: any) => ({
    'Nombre':         r.nombre,
    'Tipo':           r.tipo,
    'Costo/Unidad':   r.costo_unitario,
  }))

  const assignRows = (assignments ?? []).map((a: any) => ({
    'EDT Tarea':  a.task?.wbs  ?? '',
    'Tarea':      a.task?.name ?? '',
    'Recurso':    a.resource?.nombre ?? '',
    'Tipo':       a.resource?.tipo   ?? '',
    'Unidades':   a.unidades,
    'Costo':      a.costo ?? 0,
  }))

  const wsRes = XLSX.utils.book_new()
  const resSheet = XLSX.utils.json_to_sheet(resRows.length ? resRows : [{}])
  XLSX.utils.sheet_add_json(resSheet, assignRows, { origin: { r: resRows.length + 2, c: 0 }, header: Object.keys(assignRows[0] ?? {}) })
  XLSX.utils.book_append_sheet(wb, resSheet, 'Recursos')

  // ── Hoja 4: Dashboard ─────────────────────────────────────────────────────────
  const taskArr = tasks ?? []
  const total   = taskArr.length
  const prog    = total ? Math.round(taskArr.reduce((s, t: any) => s + (t.pct_avance_aprobado ?? 0), 0) / total) : 0
  const overdue = taskArr.filter((t: any) => t.end_date && new Date(t.end_date + 'T23:59:59') < today && t.status !== 'completed' && t.status !== 'approved').length

  const dashRows = [
    { 'Métrica': 'Fecha de reporte',     'Valor': today.toLocaleDateString('es-CL') },
    { 'Métrica': 'Proyecto',             'Valor': project.name },
    { 'Métrica': 'Total de partidas',    'Valor': total },
    { 'Métrica': '% Avance global',      'Valor': `${prog}%` },
    { 'Métrica': 'Pendientes',           'Valor': taskArr.filter((t: any) => t.status === 'pending').length },
    { 'Métrica': 'En progreso',          'Valor': taskArr.filter((t: any) => t.status === 'in_progress').length },
    { 'Métrica': 'En revisión',          'Valor': taskArr.filter((t: any) => t.status === 'in_review').length },
    { 'Métrica': 'Aprobadas',            'Valor': taskArr.filter((t: any) => t.status === 'approved').length },
    { 'Métrica': 'Completadas',          'Valor': taskArr.filter((t: any) => t.status === 'completed').length },
    { 'Métrica': 'Rechazadas',           'Valor': taskArr.filter((t: any) => t.status === 'rejected').length },
    { 'Métrica': 'Tareas atrasadas',     'Valor': overdue },
    { 'Métrica': 'Hitos',                'Valor': taskArr.filter((t: any) => t.es_hito).length },
    { 'Métrica': 'En ruta crítica',      'Valor': taskArr.filter((t: any) => t.en_ruta_critica).length },
    { 'Métrica': 'Dependencias',         'Valor': deps?.length ?? 0 },
    { 'Métrica': 'Recursos',             'Valor': resources?.length ?? 0 },
  ]

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dashRows), 'Dashboard')

  // ── Generar buffer y responder ────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `${(project.name ?? 'cronograma').replace(/[^a-z0-9]/gi, '_')}_reporte.xlsx`

  return new Response(buf, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
