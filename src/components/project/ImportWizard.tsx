'use client'

/**
 * ImportWizard — Wizard de importación MS Project XML / CSV
 *
 * Flujo:
 *  1. Selección de archivo (drag & drop o click)
 *  2. Previsualización: Tareas | Dependencias | Recursos | Asignaciones
 *  3. Confirmar → POST /api/projects/[id]/import/confirm
 */

import { useState, useRef, useCallback } from 'react'
import { Upload, X, AlertTriangle, CheckCircle, FileText, ChevronRight } from 'lucide-react'
import {
  parseMSProjectXML,
  parseCSV,
  type ParsedImport,
} from '@/lib/msproject-parser'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Step = 'select' | 'preview' | 'importing' | 'done' | 'error'
type PreviewTab = 'tasks' | 'deps' | 'resources' | 'assignments'
type ImportMode = 'replace' | 'merge'

interface Props {
  projectId:  string
  onClose:    () => void
  onSuccess:  () => void
}

// ─── Colores de estado ────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending: '#94a3b8', in_progress: '#f59e0b', in_review: '#8b5cf6',
  approved: '#22c55e', rejected: '#ef4444', completed: '#059669',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', in_progress: 'En progreso', in_review: 'En revisión',
  approved: 'Aprobada', rejected: 'Rechazada', completed: 'Completada',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ImportWizard({ projectId, onClose, onSuccess }: Props) {
  const [step,       setStep]       = useState<Step>('select')
  const [parsed,     setParsed]     = useState<ParsedImport | null>(null)
  const [fileName,   setFileName]   = useState('')
  const [tab,        setTab]        = useState<PreviewTab>('tasks')
  const [mode,       setMode]       = useState<ImportMode>('replace')
  const [dragging,   setDragging]   = useState(false)
  const [importedStats, setImportedStats] = useState<any>(null)
  const [errorMsg,   setErrorMsg]   = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Parsear archivo ─────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      const text = await file.text()
      let result: ParsedImport

      if (ext === 'xml') {
        result = parseMSProjectXML(text)
      } else if (ext === 'csv') {
        result = parseCSV(text)
      } else {
        setErrorMsg(`Formato .${ext} no soportado. Use .xml (MS Project) o .csv`)
        setStep('error')
        return
      }

      if (result.tasks.length === 0) {
        setErrorMsg('No se encontraron tareas en el archivo.')
        setStep('error')
        return
      }

      setParsed(result)
      setTab('tasks')
      setStep('preview')
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Error al leer el archivo.')
      setStep('error')
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [])

  // ── Confirmar importación ───────────────────────────────────────────────────

  async function confirm() {
    if (!parsed) return
    setStep('importing')

    const res = await fetch(`/api/projects/${projectId}/import/confirm`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        tasks:        parsed.tasks,
        dependencies: parsed.dependencies,
        resources:    parsed.resources,
        assignments:  parsed.assignments,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setErrorMsg(data.error ?? 'Error al importar.')
      setStep('error')
      return
    }

    setImportedStats(data.imported)
    setStep('done')
    setTimeout(onSuccess, 1500)
  }

  // ── Estilos compartidos ─────────────────────────────────────────────────────

  const modal: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const card: React.CSSProperties = {
    background: 'var(--surface)', borderRadius: 20, width: '90vw', maxWidth: 860,
    maxHeight: '88vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden',
  }
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.78rem',
    fontWeight: active ? 700 : 500,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? 'white' : 'var(--text-muted)',
  })

  const pill = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 100,
    background: `${color}18`, color, fontSize: '0.65rem', fontWeight: 700,
  })

  function Th({ children }: { children: React.ReactNode }) {
    return <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid var(--border)', background: 'var(--surface-hover)' }}>{children}</th>
  }
  function Td({ children }: { children: React.ReactNode }) {
    return <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--foreground)' }}>{children}</td>
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={modal} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={card}>

        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              {step === 'select'    && 'Importar cronograma'}
              {step === 'preview'   && `Vista previa — ${fileName}`}
              {step === 'importing' && 'Importando…'}
              {step === 'done'      && '¡Importación completada!'}
              {step === 'error'     && 'Error al importar'}
            </h2>
            {step === 'preview' && parsed && (
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {parsed.projectName && <><strong>{parsed.projectName}</strong> · </>}
                {parsed.tasks.length} tareas · {parsed.dependencies.length} deps · {parsed.resources.length} recursos
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={20} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* ── STEP: select ── */}
          {step === 'select' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem' }}>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 16, padding: '3rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', background: dragging ? 'rgba(249,115,22,0.04)' : 'var(--surface-hover)', transition: 'all 0.15s' }}>
                <Upload size={36} style={{ color: dragging ? 'var(--primary)' : 'var(--text-muted)', opacity: 0.6 }} />
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Arrastra tu archivo aquí o haz clic</p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Soporta: <strong>.xml</strong> (MS Project Export) · <strong>.csv</strong></p>
              </div>
              <input ref={fileRef} type="file" accept=".xml,.csv" style={{ display: 'none' }} onChange={onFileInput} />

              {/* Info sobre .mpp */}
              <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '0.875rem 1rem' }}>
                <p style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 600, color: '#3b82f6' }}>¿Tienes un archivo .mpp?</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Abre el proyecto en MS Project y usa <strong>Archivo → Guardar como → XML (.xml)</strong>.
                  Para soporte nativo de .mpp sin abrir MS Project, se puede integrar{' '}
                  <strong>MPXJ</strong> como microservicio Java/Python que convierte .mpp → XML automáticamente.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: preview ── */}
          {step === 'preview' && parsed && (
            <>
              {/* Warnings */}
              {parsed.warnings.length > 0 && (
                <div style={{ margin: '0.75rem 1.5rem 0', padding: '0.6rem 1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, display: 'flex', gap: '8px', alignItems: 'flex-start', flexShrink: 0 }}>
                  <AlertTriangle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    {parsed.warnings.map((w, i) => <p key={i} style={{ margin: '1px 0', fontSize: '0.75rem', color: '#92400e' }}>{w}</p>)}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px', flexShrink: 0 }}>
                {([
                  ['tasks',       `Tareas (${parsed.tasks.length})`],
                  ['deps',        `Dependencias (${parsed.dependencies.length})`],
                  ['resources',   `Recursos (${parsed.resources.length})`],
                  ['assignments', `Asignaciones (${parsed.assignments.length})`],
                ] as [PreviewTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)} style={tabBtn(tab === id)}>{label}</button>
                ))}
              </div>

              {/* Tabla de previsualización */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>

                  {/* Tareas */}
                  {tab === 'tasks' && (<>
                    <thead><tr><Th>WBS</Th><Th>Nombre</Th><Th>Inicio</Th><Th>Fin</Th><Th>Días</Th><Th>% Av.</Th><Th>Estado</Th><Th>Hito</Th></tr></thead>
                    <tbody>
                      {parsed.tasks.map(t => {
                        const status = t.pct_avance >= 100 ? 'completed' : t.pct_avance > 0 ? 'in_progress' : 'pending'
                        return (
                          <tr key={t.uid}>
                            <Td><span style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t.wbs || '—'}</span></Td>
                            <Td><span style={{ paddingLeft: `${(t.outline_level - 1) * 12}px`, fontWeight: t.is_summary ? 600 : 400 }}>{t.name}</span></Td>
                            <Td>{t.start_date || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                            <Td>{t.end_date   || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                            <Td>{t.duracion ?? '—'}</Td>
                            <Td>{t.pct_avance}%</Td>
                            <Td><span style={pill(STATUS_COLOR[status])}>{STATUS_LABEL[status]}</span></Td>
                            <Td>{t.es_hito ? '◆' : ''}</Td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </>)}

                  {/* Dependencias */}
                  {tab === 'deps' && (<>
                    <thead><tr><Th>Predecesora</Th><Th>Sucesora</Th><Th>Tipo</Th><Th>Lag (días)</Th></tr></thead>
                    <tbody>
                      {parsed.dependencies.length === 0
                        ? <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin dependencias detectadas</td></tr>
                        : parsed.dependencies.map((d, i) => {
                          const pred = parsed.tasks.find(t => t.uid === d.pred_uid)
                          const succ = parsed.tasks.find(t => t.uid === d.succ_uid)
                          return (
                            <tr key={i}>
                              <Td>{pred?.wbs && <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--text-muted)', marginRight: 6 }}>{pred.wbs}</span>}{pred?.name}</Td>
                              <Td>{succ?.wbs && <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--text-muted)', marginRight: 6 }}>{succ.wbs}</span>}{succ?.name}</Td>
                              <Td><span style={{ ...pill('#8b5cf6'), fontFamily: 'monospace' }}>{d.tipo}</span></Td>
                              <Td>{d.lag !== 0 ? (d.lag > 0 ? `+${d.lag}d` : `${d.lag}d`) : '—'}</Td>
                            </tr>
                          )
                        })
                      }
                    </tbody>
                  </>)}

                  {/* Recursos */}
                  {tab === 'resources' && (<>
                    <thead><tr><Th>Nombre</Th><Th>Tipo</Th><Th>Costo/unidad</Th></tr></thead>
                    <tbody>
                      {parsed.resources.length === 0
                        ? <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin recursos detectados</td></tr>
                        : parsed.resources.map(r => (
                          <tr key={r.uid}>
                            <Td>{r.nombre}</Td>
                            <Td><span style={pill(r.tipo === 'persona' ? '#22c55e' : '#f59e0b')}>{r.tipo}</span></Td>
                            <Td>{r.costo_unitario > 0 ? r.costo_unitario.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }) : '—'}</Td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </>)}

                  {/* Asignaciones */}
                  {tab === 'assignments' && (<>
                    <thead><tr><Th>Tarea</Th><Th>Recurso</Th><Th>Unidades</Th></tr></thead>
                    <tbody>
                      {parsed.assignments.length === 0
                        ? <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin asignaciones detectadas</td></tr>
                        : parsed.assignments.map((a, i) => {
                          const task = parsed.tasks.find(t => t.uid === a.task_uid)
                          const res  = parsed.resources.find(r => r.uid === a.resource_uid)
                          return (
                            <tr key={i}>
                              <Td>{task?.wbs && <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--text-muted)', marginRight: 6 }}>{task.wbs}</span>}{task?.name}</Td>
                              <Td>{res?.nombre}</Td>
                              <Td>{(a.unidades * 100).toFixed(0)}%</Td>
                            </tr>
                          )
                        })
                      }
                    </tbody>
                  </>)}
                </table>
              </div>

              {/* Footer de previsualización */}
              <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0, background: 'var(--surface-hover)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Modo:</span>
                  {(['replace', 'merge'] as ImportMode[]).map(m => (
                    <button key={m} onClick={() => setMode(m)} style={{ padding: '4px 10px', borderRadius: 8, border: `1.5px solid ${mode === m ? 'var(--primary)' : 'var(--border)'}`, background: mode === m ? 'rgba(249,115,22,0.08)' : 'transparent', color: mode === m ? 'var(--primary)' : 'var(--text-muted)', fontSize: '0.75rem', fontWeight: mode === m ? 700 : 400, cursor: 'pointer' }}>
                      {m === 'replace' ? 'Reemplazar todo' : 'Agregar al proyecto'}
                    </button>
                  ))}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {mode === 'replace' ? '— elimina tareas actuales' : '— conserva tareas actuales'}
                  </span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  <button onClick={() => setStep('select')} style={{ padding: '7px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>← Cambiar archivo</button>
                  <button onClick={confirm} style={{ padding: '7px 20px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Importar {parsed.tasks.length} tareas <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── STEP: importing ── */}
          {step === 'importing' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, border: '4px solid var(--border)', borderTop: '4px solid var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>Importando tareas, dependencias y recursos…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
              <CheckCircle size={48} color="#22c55e" />
              <p style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Importación completada</p>
              {importedStats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center' }}>
                  {[['Tareas', importedStats.tasks], ['Dependencias', importedStats.dependencies], ['Recursos', importedStats.resources], ['Asignaciones', importedStats.assignments]].map(([label, val]) => (
                    <div key={label as string} style={{ background: 'var(--surface-hover)', padding: '0.75rem 1.25rem', borderRadius: 12 }}>
                      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{val}</p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: error ── */}
          {step === 'error' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem' }}>
              <AlertTriangle size={44} color="#ef4444" />
              <p style={{ fontSize: '0.9rem', color: '#ef4444', margin: 0, textAlign: 'center' }}>{errorMsg}</p>
              <button onClick={() => setStep('select')} style={{ padding: '7px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>Intentar de nuevo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
