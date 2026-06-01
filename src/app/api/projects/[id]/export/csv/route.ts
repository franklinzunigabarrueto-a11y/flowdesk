/**
 * GET /api/projects/[id]/export/csv
 *
 * Exporta todas las tareas del proyecto como CSV compatible con Excel.
 * Incluye columnas: Nombre, WBS, Inicio, Fin, Duración, % Avance Aprobado,
 * % Avance Propuesto, Estado, Es Hito, Ruta Crítica, Partida Padre.
 *
 * Para exportar a Excel (.xlsx) se recomienda instalar el paquete `xlsx`
 * y agregar un route análogo en /export/excel que use:
 *   const wb = XLSX.utils.book_new()
 *   const ws = XLSX.utils.json_to_sheet(rows)
 *   XLSX.utils.book_append_sheet(wb, ws, 'Cronograma')
 *   const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

const STATUS_ES: Record<string, string> = {
  pending:     'Pendiente',
  in_progress: 'En progreso',
  in_review:   'En revisión',
  approved:    'Aprobada',
  rejected:    'Rechazada',
  completed:   'Completada',
}

function q(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects').select('id, name').eq('id', id).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('*, parent:parent_id(name, wbs)')
    .eq('project_id', id)
    .order('sort_order')

  const rows = (tasks ?? []).map((t: any) => [
    q(t.name),
    q(t.wbs),
    q(t.start_date),
    q(t.end_date),
    q(t.duracion ?? (t.start_date && t.end_date
      ? Math.round((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86_400_000)
      : null)),
    q(t.pct_avance_aprobado  ?? 0),
    q(t.pct_avance_propuesto ?? 0),
    q(STATUS_ES[t.status] ?? t.status),
    t.es_hito          ? '1' : '0',
    t.en_ruta_critica  ? '1' : '0',
    t.is_summary       ? '1' : '0',
    q(t.parent?.wbs ?? ''),
  ].join(','))

  const header = [
    'Nombre', 'WBS', 'Inicio', 'Fin', 'Duración (días)',
    '% Avance Aprobado', '% Avance Propuesto', 'Estado',
    'Es Hito', 'Ruta Crítica', 'Es Resumen', 'WBS Padre',
  ].join(',')

  const csv = [header, ...rows].join('\n')
  const filename = `${(project.name ?? 'cronograma').replace(/[^a-z0-9]/gi, '_')}_cronograma.csv`

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
