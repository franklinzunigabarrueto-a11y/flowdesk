/**
 * msproject-parser.ts
 *
 * Parser client-side para archivos de MS Project (.xml) y CSV.
 * Corre en el browser usando DOMParser nativo.
 *
 * ─── Mapeos MS Project → Flowdesk ────────────────────────────────────────────
 *
 *  Task.Duration           PT40H0M0S (ISO) → días (÷ horasLaborales)
 *  PredecessorLink.Type    0=FF 1=FS 2=SF 3=SS → 'FF'|'FS'|'SF'|'SS'
 *  PredecessorLink.LinkLag minutos ÷ 600 → días
 *  Resource.Type           0=Work → 'persona'  1/2=Material → 'material'
 *  Resource.StandardRate   costo_unitario
 *  Assignment.Units        fracción (1.0 = 100%)
 *
 * ─── Nota sobre .mpp ─────────────────────────────────────────────────────────
 *  El formato .mpp es binario propietario de Microsoft.
 *  Para soportarlo sin pagar licencia, la opción más sólida es MPXJ
 *  (https://www.mpxj.org), librería Java/Python que convierte .mpp → XML.
 *  Se puede exponer como microservicio (ej. Cloud Run + Java) y que Flowdesk
 *  le envíe el archivo. La conversión produce el mismo XML que exporta MSP,
 *  así el parser existente funciona sin cambios.
 */

// ─── Tipos internos del parser ────────────────────────────────────────────────

export interface ParsedTask {
  uid:           string
  name:          string
  wbs:           string | null
  outline_level: number
  parent_uid:    string | null   // derivado del WBS
  start_date:    string | null
  end_date:      string | null
  duracion:      number | null   // días laborales
  pct_avance:    number          // 0-100
  es_hito:       boolean
  is_summary:    boolean
  en_ruta_critica: boolean
  sort_order:    number
}

export interface ParsedDependency {
  pred_uid: string
  succ_uid: string
  tipo:     'FS' | 'SS' | 'FF' | 'SF'
  lag:      number  // días
}

export interface ParsedResource {
  uid:           string
  nombre:        string
  tipo:          'persona' | 'equipo' | 'material'
  costo_unitario: number
}

export interface ParsedAssignment {
  task_uid:     string
  resource_uid: string
  unidades:     number
}

export interface ParsedImport {
  tasks:        ParsedTask[]
  dependencies: ParsedDependency[]
  resources:    ParsedResource[]
  assignments:  ParsedAssignment[]
  warnings:     string[]
  projectName:  string | null
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** Lee texto de un elemento child del nodo dado */
function txt(node: Element, tag: string): string {
  return node.querySelector(tag)?.textContent?.trim() ?? ''
}

/** Convierte duración ISO 8601 (PT40H0M0S) o minutos a días laborales (8h) */
function parseDuration(raw: string): number | null {
  if (!raw || raw === 'NA') return null
  // ISO: PT40H0M0S
  const isoMatch = raw.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] ?? '0')
    const mins  = parseInt(isoMatch[2] ?? '0')
    const totalH = hours + mins / 60
    return Math.max(1, Math.round(totalH / 8))
  }
  // Formato legacy: minutos enteros
  const mins = parseInt(raw)
  if (!isNaN(mins) && mins > 0) return Math.max(1, Math.round(mins / 480))
  return null
}

/** Convierte fecha ISO de MSP a YYYY-MM-DD */
function parseDate(raw: string): string | null {
  if (!raw || raw === 'NA') return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Mapea Type de dependencia MSP → Flowdesk */
const DEP_TYPE_MAP: Record<string, 'FS' | 'SS' | 'FF' | 'SF'> = {
  '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS',
}

/** Mapea Type de recurso MSP → Flowdesk */
function resourceType(t: string): 'persona' | 'equipo' | 'material' {
  if (t === '0') return 'persona'
  return 'material'
}

/** Deriva parent_uid a partir del WBS (ej. "1.2.3" → "1.2") */
function parentWbs(wbs: string): string | null {
  const parts = wbs.split('.')
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join('.')
}

// ─── Parser MS Project XML ────────────────────────────────────────────────────

export function parseMSProjectXML(xml: string): ParsedImport {
  const warnings: string[] = []

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) throw new Error('XML inválido')
  } catch {
    return { tasks: [], dependencies: [], resources: [], assignments: [], warnings: ['XML no válido o corrupto'], projectName: null }
  }

  const projectName = doc.querySelector('Project > Name')?.textContent?.trim() ?? null

  // ── Tareas ──────────────────────────────────────────────────────────────────
  const taskEls = Array.from(doc.querySelectorAll('Tasks > Task'))
    .filter(el => txt(el, 'UID') !== '0' && txt(el, 'Name'))

  const tasks: ParsedTask[] = []
  const wbsToUid = new Map<string, string>()  // para mapear dependencias

  taskEls.forEach((el, i) => {
    const uid    = txt(el, 'UID')
    const wbs    = txt(el, 'WBS') || null
    const level  = parseInt(txt(el, 'OutlineLevel') || '1')
    const pct    = parseInt(txt(el, 'PercentComplete') || '0')
    const dur    = parseDuration(txt(el, 'Duration'))

    if (wbs) wbsToUid.set(wbs, uid)

    const task: ParsedTask = {
      uid,
      name:         txt(el, 'Name') || 'Sin nombre',
      wbs,
      outline_level: isNaN(level) ? 1 : level,
      parent_uid:   wbs ? (parentWbs(wbs) ? wbsToUid.get(parentWbs(wbs)!) ?? null : null) : null,
      start_date:   parseDate(txt(el, 'Start')),
      end_date:     parseDate(txt(el, 'Finish')),
      duracion:     dur,
      pct_avance:   Math.min(100, Math.max(0, isNaN(pct) ? 0 : pct)),
      es_hito:      txt(el, 'Milestone') === '1',
      is_summary:   txt(el, 'Summary') === '1',
      en_ruta_critica: txt(el, 'Critical') === '1',
      sort_order:   i,
    }
    tasks.push(task)
  })

  if (tasks.length === 0) warnings.push('No se encontraron tareas en el archivo.')
  const sinFecha = tasks.filter(t => !t.start_date && !t.end_date).length
  if (sinFecha > 0) warnings.push(`${sinFecha} tarea(s) sin fechas de inicio/fin.`)

  // ── Dependencias (PredecessorLink dentro de cada Task) ─────────────────────
  const dependencies: ParsedDependency[] = []
  const depSeen = new Set<string>()

  taskEls.forEach(el => {
    const succUid = txt(el, 'UID')
    el.querySelectorAll('PredecessorLink').forEach(link => {
      const predUid = txt(link, 'PredecessorUID')
      if (!predUid || predUid === succUid) return
      const key = `${predUid}-${succUid}`
      if (depSeen.has(key)) return
      depSeen.add(key)

      const typeRaw = txt(link, 'Type') || '1'
      const lagMin  = parseInt(txt(link, 'LinkLag') || '0')

      dependencies.push({
        pred_uid: predUid,
        succ_uid: succUid,
        tipo:     DEP_TYPE_MAP[typeRaw] ?? 'FS',
        lag:      isNaN(lagMin) ? 0 : Math.round(lagMin / 600 / 8),  // décimas de minuto → días
      })
    })
  })

  // ── Recursos ────────────────────────────────────────────────────────────────
  const resources: ParsedResource[] = []
  const resEls = Array.from(doc.querySelectorAll('Resources > Resource'))
    .filter(el => txt(el, 'UID') !== '0' && txt(el, 'Name'))

  resEls.forEach(el => {
    const rate = parseFloat(txt(el, 'StandardRate') || '0')
    resources.push({
      uid:           txt(el, 'UID'),
      nombre:        txt(el, 'Name'),
      tipo:          resourceType(txt(el, 'Type')),
      costo_unitario: isNaN(rate) ? 0 : rate,
    })
  })

  // ── Asignaciones ────────────────────────────────────────────────────────────
  const assignments: ParsedAssignment[] = []
  const assignEls = Array.from(doc.querySelectorAll('Assignments > Assignment'))

  assignEls.forEach(el => {
    const taskUid = txt(el, 'TaskUID')
    const resUid  = txt(el, 'ResourceUID')
    if (!taskUid || taskUid === '0' || !resUid || resUid === '0') return

    const units = parseFloat(txt(el, 'Units') || '1')
    assignments.push({
      task_uid:     taskUid,
      resource_uid: resUid,
      unidades:     isNaN(units) ? 1 : units,
    })
  })

  return { tasks, dependencies, resources, assignments, warnings, projectName }
}

// ─── Parser CSV ───────────────────────────────────────────────────────────────

/**
 * Espera cabecera: Nombre,WBS,Inicio,Fin,Duración,% Avance,Estado,Es Hito
 * Delimitador: coma o punto y coma (autodetectado)
 */
export function parseCSV(text: string): ParsedImport {
  const warnings: string[] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { tasks: [], dependencies: [], resources: [], assignments: [], warnings: ['CSV vacío'], projectName: null }

  // Autodetectar delimitador
  const delim = lines[0].includes(';') ? ';' : ','

  function splitLine(line: string): string[] {
    const result: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === delim && !inQ) { result.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    result.push(cur.trim())
    return result
  }

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const col = (name: string) => headers.findIndex(h => h.includes(name))

  const iNombre  = col('nombre')
  const iWbs     = col('wbs')
  const iInicio  = col('inicio')
  const iFin     = col('fin')
  const iDur     = col('duraci')
  const iPct     = col('avance')
  const iHito    = col('hito')

  if (iNombre < 0) {
    return { tasks: [], dependencies: [], resources: [], assignments: [], warnings: ['No se encontró columna "Nombre"'], projectName: null }
  }

  const wbsToUid = new Map<string, string>()
  const tasks: ParsedTask[] = lines.slice(1).map((line, i) => {
    const cols     = splitLine(line)
    const wbs      = iWbs >= 0 ? (cols[iWbs] || null) : null
    const level    = wbs ? wbs.split('.').length : 1
    const uid      = String(i + 1)
    if (wbs) wbsToUid.set(wbs, uid)

    return {
      uid,
      name:           cols[iNombre] || 'Sin nombre',
      wbs,
      outline_level:  level,
      parent_uid:     wbs && parentWbs(wbs) ? wbsToUid.get(parentWbs(wbs)!) ?? null : null,
      start_date:     iInicio >= 0 ? parseDate(cols[iInicio]) : null,
      end_date:       iFin    >= 0 ? parseDate(cols[iFin])    : null,
      duracion:       iDur    >= 0 ? (parseInt(cols[iDur]) || null) : null,
      pct_avance:     iPct    >= 0 ? Math.min(100, Math.max(0, parseInt(cols[iPct]) || 0)) : 0,
      es_hito:        iHito   >= 0 ? ['1','true','si','sí','yes'].includes((cols[iHito] ?? '').toLowerCase()) : false,
      is_summary:     false,
      en_ruta_critica: false,
      sort_order:     i,
    }
  })

  if (tasks.length === 0) warnings.push('No se encontraron filas de datos.')

  return { tasks, dependencies: [], resources: [], assignments: [], warnings, projectName: null }
}

// ─── Generador CSV (export) ───────────────────────────────────────────────────

export function tasksToCSV(tasks: { name: string; wbs: string|null; start_date: string|null; end_date: string|null; duration_days: number|null; progress: number; status: string; is_milestone: boolean }[]): string {
  const header = 'Nombre,WBS,Inicio,Fin,Duración,% Avance,Estado,Es Hito'
  const q = (s: string | null) => s ? `"${String(s).replace(/"/g, '""')}"` : ''
  const rows = tasks.map(t => [
    q(t.name), q(t.wbs), q(t.start_date), q(t.end_date),
    t.duration_days ?? '', t.progress, q(t.status), t.is_milestone ? '1' : '0',
  ].join(','))
  return [header, ...rows].join('\n')
}
