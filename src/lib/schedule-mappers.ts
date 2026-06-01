// Mappers between DB column names (Spanish) and frontend type names (English)

// ─── project_tasks ───────────────────────────────────────────────────────────

const TASK_DB_COLS = new Set([
  'id','project_id','parent_id','name','wbs','outline_level',
  'start_date','end_date','progress','status','is_summary','sort_order',
  'duracion','pct_avance_propuesto','pct_avance_aprobado','es_hito','en_ruta_critica',
  'created_at','updated_at',
])

export function mapTaskToFrontend(t: any) {
  return {
    ...t,
    progress:          t.pct_avance_aprobado  ?? t.progress  ?? 0,
    progress_proposed: t.pct_avance_propuesto ?? 0,
    is_milestone:      t.es_hito              ?? false,
    critical_path:     t.en_ruta_critica      ?? false,
    duration_days:     t.duracion             ?? null,
    // fields not in DB — provide safe defaults
    color:            t.color            ?? null,
    assignee_name:    t.assignee_name    ?? null,
    baseline_start:   t.baseline_start   ?? null,
    baseline_end:     t.baseline_end     ?? null,
    baseline_progress: t.baseline_progress ?? 0,
    proposed_by:      null,
    proposed_at:      null,
    approved_by:      null,
    approved_at:      null,
    rejection_reason: null,
  }
}

// Maps a PATCH/POST body from frontend field names to DB column names,
// filtering out fields that don't exist in the DB.
export function mapTaskPatchToDB(body: any) {
  const patch: any = {}
  for (const [k, v] of Object.entries(body)) {
    if (k === 'progress')          { patch.pct_avance_aprobado  = v; continue }
    if (k === 'progress_proposed') { patch.pct_avance_propuesto = v; continue }
    if (k === 'is_milestone')      { patch.es_hito              = v; continue }
    if (k === 'critical_path')     { patch.en_ruta_critica      = v; continue }
    if (k === 'duration_days')     { patch.duracion             = v; continue }
    if (TASK_DB_COLS.has(k))       { patch[k] = v }
    // silently drop non-DB fields (color, assignee_name, baseline_*, etc.)
  }
  return patch
}

// ─── schedule_dependencies ───────────────────────────────────────────────────

export function mapDepToFrontend(d: any) {
  return {
    ...d,
    predecessor_id: d.predecesora_id,
    successor_id:   d.sucesora_id,
    type:           d.tipo,
    lag_days:       d.lag ?? 0,
    predecesora:    d.predecesora,
    sucesora:       d.sucesora,
  }
}

export function mapDepInputToDB(body: any) {
  return {
    predecesora_id: body.predecesora_id ?? body.predecessor_id,
    sucesora_id:    body.sucesora_id    ?? body.successor_id,
    tipo:           body.tipo           ?? body.type ?? 'FS',
    lag:            body.lag            ?? body.lag_days ?? 0,
  }
}

// ─── schedule_resources ──────────────────────────────────────────────────────

const TIPO_TO_TYPE: Record<string, string> = {
  persona:   'person',
  equipo:    'equipment',
  material:  'material',
}
const TYPE_TO_TIPO: Record<string, string> = {
  person:    'persona',
  equipment: 'equipo',
  material:  'material',
}

export function mapResourceToFrontend(r: any) {
  const rawTipo = r.tipo ?? r.type ?? ''
  return {
    ...r,
    name:          r.nombre         ?? r.name,
    type:          TIPO_TO_TYPE[rawTipo] ?? rawTipo,
    cost_per_unit: r.costo_unitario  ?? r.cost_per_unit ?? 0,
    unit:          r.unit            ?? '',
    assignments:   r.assignments,
  }
}

export function mapResourceInputToDB(body: any) {
  const rawType = body.tipo ?? body.type ?? ''
  const out: any = {}
  if (body.project_id) out.project_id   = body.project_id
  out.nombre         = body.nombre         ?? body.name
  out.tipo           = TYPE_TO_TIPO[rawType] ?? rawType
  out.costo_unitario = body.costo_unitario  ?? body.cost_per_unit ?? 0
  if (body.unit !== undefined) out.unit = body.unit
  return out
}

// ─── schedule_assignments ────────────────────────────────────────────────────

export function mapAssignmentToFrontend(a: any) {
  return {
    ...a,
    units:      a.unidades  ?? a.units      ?? 1,
    total_cost: a.costo     ?? a.total_cost ?? 0,
    resource:   a.resource  ? mapResourceToFrontend(a.resource) : null,
    user:       a.user      ?? null,
    task:       a.task,
  }
}

export function mapAssignmentInputToDB(body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {
    task_id:     body.task_id,
    resource_id: body.resource_id ?? null,
    user_id:     body.user_id     ?? null,
    unidades:    body.unidades    ?? body.units ?? 1,
  }
  // costo puede ser calculado externamente y pasado ya calculado
  if (body.costo     !== undefined) out.costo = body.costo
  if (body.total_cost !== undefined) out.costo = body.total_cost
  return out
}

// ─── schedule_baselines ──────────────────────────────────────────────────────

export function mapBaselineToFrontend(b: any) {
  // snapshot puede ser { tasks, dependencies } o un array legacy — normalizar a array
  const raw = b.snapshot
  const tasks: any[] = Array.isArray(raw) ? raw : (raw?.tasks ?? [])

  return {
    ...b,
    name:       b.nombre         ?? b.name,
    created_at: b.fecha_creacion ?? b.created_at,
    snapshot:   tasks.map(mapTaskToFrontend),
  }
}

// ─── schedule_approval_logs ──────────────────────────────────────────────────

export function mapLogToFrontend(l: any) {
  return {
    ...l,
    action:         l.accion      ?? l.action,
    comment:        l.comentario  ?? l.comment ?? null,
    progress_value: l.pct_avance  ?? l.progress_value ?? null,
    user:           l.user,
  }
}
