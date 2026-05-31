import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function localTime(isoString: string, timezone: string) {
  return new Date(isoString).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  })
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminDb()
  const now = new Date()
  const results = { eventsSent: 0, tasksSent: 0, errors: 0 }

  // ── 1. Recordatorios de eventos ────────────────────────────────────────────
  // Busca eventos en las próximas 24 h y filtra los que deben dispararse ahora
  // según su reminder_minutes individual (default 60). Ventana de ±5 min.
  const upcoming = new Date(now.getTime() + 24 * 60 * 60_000).toISOString()

  const { data: events } = await db
    .from('calendar_events')
    .select('id, title, start_time, reminder_minutes, user_id')
    .gte('start_time', now.toISOString())
    .lte('start_time', upcoming)

  const toRemind = (events ?? []).filter(ev => {
    const mins = ev.reminder_minutes ?? 60
    const reminderAt = new Date(ev.start_time).getTime() - mins * 60_000
    return reminderAt >= now.getTime() - 5 * 60_000
        && reminderAt <= now.getTime() + 5 * 60_000
  })

  if (toRemind.length) {
    const eventIds = toRemind.map(e => e.id)

    const { data: alreadySent } = await db
      .from('reminder_logs')
      .select('entity_id')
      .eq('entity_type', 'event')
      .in('entity_id', eventIds)

    const sentSet = new Set(alreadySent?.map(r => r.entity_id) ?? [])

    const userIds = [...new Set(toRemind.map(e => e.user_id))]
    const { data: users } = await db
      .from('users')
      .select('id, whatsapp_number, timezone')
      .in('id', userIds)
      .not('whatsapp_number', 'is', null)

    const userMap = new Map(users?.map(u => [u.id, u]) ?? [])

    for (const event of toRemind) {
      if (sentSet.has(event.id)) continue
      const user = userMap.get(event.user_id)
      if (!user?.whatsapp_number) continue

      const tz   = user.timezone || 'America/Santiago'
      const hora = localTime(event.start_time, tz)
      const mins = event.reminder_minutes ?? 60
      const label = mins >= 60 && mins % 60 === 0
        ? `${mins / 60} hora${mins / 60 > 1 ? 's' : ''}`
        : `${mins} minuto${mins > 1 ? 's' : ''}`

      try {
        await sendWhatsAppMessage(
          user.whatsapp_number,
          `🔔 *Recordatorio:* "${event.title}" comienza en ${label}, a las *${hora} hrs*.`
        )
        await db.from('reminder_logs').insert({
          user_id: event.user_id,
          entity_type: 'event',
          entity_id: event.id,
        })
        results.eventsSent++
      } catch (e) {
        console.error('[reminders] event send error:', e)
        results.errors++
      }
    }
  }

  // ── 2. Recordatorios de tareas (a las 08:00 hora local del usuario) ────────
  // Las tareas solo tienen due_date (sin hora), se avisa al inicio del día
  const { data: allUsers } = await db
    .from('users')
    .select('id, whatsapp_number, name, timezone')
    .not('whatsapp_number', 'is', null)

  if (allUsers?.length) {
    for (const user of allUsers) {
      const tz           = user.timezone || 'America/Santiago'
      const localHour    = parseInt(now.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: tz }))
      const localMinute  = parseInt(now.toLocaleTimeString('en-US', { minute: '2-digit', timeZone: tz }))

      // Solo entre 08:00 y 08:09 en la zona horaria del usuario
      if (localHour !== 8 || localMinute > 9) continue

      const today = now.toLocaleDateString('en-CA', { timeZone: tz })

      const { data: tasks } = await db
        .from('tasks')
        .select('id, title, priority')
        .eq('user_id', user.id)
        .eq('due_date', today)
        .in('status', ['pending', 'in_progress'])

      if (!tasks?.length) continue

      const taskIds = tasks.map(t => t.id)
      const { data: sentTasks } = await db
        .from('reminder_logs')
        .select('entity_id')
        .eq('entity_type', 'task')
        .in('entity_id', taskIds)

      const sentTaskSet = new Set(sentTasks?.map(r => r.entity_id) ?? [])
      const pending = tasks.filter(t => !sentTaskSet.has(t.id))
      if (!pending.length) continue

      const list = pending
        .map(t => `• ${t.title}${t.priority === 'high' ? ' 🔴' : t.priority === 'medium' ? ' 🟡' : ''}`)
        .join('\n')

      try {
        await sendWhatsAppMessage(
          user.whatsapp_number,
          `📋 *Tienes ${pending.length} tarea${pending.length > 1 ? 's' : ''} para hoy:*\n${list}`
        )
        await db.from('reminder_logs').insert(
          pending.map(t => ({ user_id: user.id, entity_type: 'task', entity_id: t.id }))
        )
        results.tasksSent += pending.length
      } catch (e) {
        console.error('[reminders] task send error:', e)
        results.errors++
      }
    }
  }

  console.log('[cron/reminders]', results)
  return NextResponse.json({ ok: true, ...results })
}
