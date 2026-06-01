/**
 * schedule-notifications.ts
 *
 * Notificaciones WhatsApp para el flujo de aprobación de tareas.
 *
 * Reglas:
 *  - Tarea → "En revisión"  : notificar a todos los admins del proyecto.
 *  - Tarea → "Aprobada"     : notificar a los profesionales asignados a la tarea.
 *  - Tarea → "Rechazada"    : notificar a los profesionales asignados a la tarea.
 *
 * Todas las llamadas son fire-and-forget: un fallo de WA no bloquea la respuesta.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from './whatsapp'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAdminPhones(supabase: SupabaseClient, projectId: string): Promise<string[]> {
  // Dueño del proyecto
  const { data: project } = await supabase
    .from('projects').select('user_id').eq('id', projectId).single()

  const adminIds: string[] = project?.user_id ? [project.user_id] : []

  // Admins explícitos en project_members
  const { data: members } = await supabase
    .from('schedule_project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('role', 'admin')

  for (const m of members ?? []) {
    if (!adminIds.includes(m.user_id)) adminIds.push(m.user_id)
  }

  if (adminIds.length === 0) return []

  const { data: users } = await supabase
    .from('users')
    .select('whatsapp_number')
    .in('id', adminIds)

  return (users ?? []).map((u: any) => u.whatsapp_number).filter(Boolean)
}

async function getProfessionalPhones(supabase: SupabaseClient, taskId: string): Promise<string[]> {
  const { data: assignments } = await supabase
    .from('schedule_assignments')
    .select('user:user_id(whatsapp_number)')
    .eq('task_id', taskId)
    .not('user_id', 'is', null)

  return ((assignments ?? []) as any[])
    .map(a => a.user?.whatsapp_number)
    .filter(Boolean)
}

async function send(phones: string[], message: string): Promise<void> {
  await Promise.allSettled(phones.map(phone => sendWhatsAppMessage(phone, message)))
}

// ─── Notificaciones por evento ────────────────────────────────────────────────

export async function notifyTaskInReview(
  supabase:   SupabaseClient,
  projectId:  string,
  taskId:     string,
  taskName:   string,
  wbsCode:    string | null,
  pctAvance:  number,
  reporterName: string,
): Promise<void> {
  const phones = await getAdminPhones(supabase, projectId)
  if (phones.length === 0) return

  const wbs = wbsCode ? `(${wbsCode}) ` : ''
  const msg =
    `📋 *Tarea en revisión — FlowDesk*\n\n` +
    `La tarea ${wbs}*${taskName}* está lista para revisión.\n\n` +
    `• Avance propuesto: *${pctAvance}%*\n` +
    `• Reportado por: ${reporterName}\n\n` +
    `Ingresa a FlowDesk para aprobar o rechazar.`

  await send(phones, msg)
}

export async function notifyTaskApproved(
  supabase:     SupabaseClient,
  taskId:       string,
  taskName:     string,
  wbsCode:      string | null,
  pctAprobado:  number,
  adminName:    string,
  comentario:   string | null,
): Promise<void> {
  const phones = await getProfessionalPhones(supabase, taskId)
  if (phones.length === 0) return

  const wbs = wbsCode ? `(${wbsCode}) ` : ''
  const msg =
    `✅ *Avance aprobado — FlowDesk*\n\n` +
    `Tu avance en la tarea ${wbs}*${taskName}* fue aprobado.\n\n` +
    `• Avance oficial: *${pctAprobado}%*\n` +
    `• Aprobado por: ${adminName}` +
    (comentario ? `\n• Comentario: ${comentario}` : '')

  await send(phones, msg)
}

export async function notifyTaskRejected(
  supabase:    SupabaseClient,
  taskId:      string,
  taskName:    string,
  wbsCode:     string | null,
  adminName:   string,
  comentario:  string | null,
): Promise<void> {
  const phones = await getProfessionalPhones(supabase, taskId)
  if (phones.length === 0) return

  const wbs = wbsCode ? `(${wbsCode}) ` : ''
  const msg =
    `❌ *Avance rechazado — FlowDesk*\n\n` +
    `El avance en la tarea ${wbs}*${taskName}* fue rechazado.\n\n` +
    `• Rechazado por: ${adminName}` +
    (comentario ? `\n• Motivo: ${comentario}` : '') +
    `\n\nPor favor revisa el trabajo y vuelve a reportar.`

  await send(phones, msg)
}
