import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analyzeMessage, completePendingItems, transcribeAudio, IntentItem } from '@/lib/gemini'
import { sendWhatsAppMessage, downloadWhatsAppMedia } from '@/lib/whatsapp'
import { createCalendarEvent, findCalendarByName } from '@/lib/google-calendar'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

async function processItem(
  item: IntentItem,
  user: any,
  textContent: string,
  today: string,
  messageId: string,
  supabase: ReturnType<typeof getSupabase>
) {
  switch (item.type) {
    case 'task': {
      await supabase.from('tasks').insert({
        user_id: user.id,
        title: item.data.title || textContent.substring(0, 80),
        description: item.data.description,
        priority: item.data.priority || 'medium',
        due_date: item.data.due_date,
        status: 'pending',
        whatsapp_message_id: messageId,
      })
      break
    }

    case 'event': {
      if (!item.data.event_start) break
      const eventTitle = item.data.title || textContent.substring(0, 80)
      let googleEventId: string | undefined

      if (user.google_access_token) {
        try {
          let calendarId = 'primary'
          if (item.data.calendar_name) {
            calendarId = await findCalendarByName({
              accessToken: user.google_access_token,
              refreshToken: user.google_refresh_token,
              name: item.data.calendar_name,
            })
          }
          const gcalEvent = await createCalendarEvent({
            accessToken: user.google_access_token,
            refreshToken: user.google_refresh_token,
            title: eventTitle,
            description: item.data.description,
            startTime: item.data.event_start,
            endTime: item.data.event_end,
            timezone: user.timezone || 'America/Santiago',
            calendarId,
          })
          googleEventId = gcalEvent.googleEventId
        } catch (e) {
          console.error('Error creando evento en Google Calendar:', e)
        }
      }

      await supabase.from('calendar_events').insert({
        user_id: user.id,
        title: eventTitle,
        description: item.data.description,
        start_time: item.data.event_start,
        end_time: item.data.event_end,
        google_event_id: googleEventId,
        whatsapp_message_id: messageId,
      })
      break
    }

    case 'task_complete': {
      const keywords = item.data.task_keywords || []
      if (keywords.length > 0) {
        const { data: pendingTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['pending', 'in_progress'])

        const matchedTask = pendingTasks?.find(t =>
          keywords.some(kw => t.title.toLowerCase().includes(kw.toLowerCase()))
        )
        if (matchedTask) {
          await supabase.from('tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString()
          }).eq('id', matchedTask.id)
        }
      }
      break
    }
  }
}

export async function POST(request: Request) {
  const body = await request.json()

  try {
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const messages = value?.messages

    if (!messages?.length) return NextResponse.json({ ok: true })

    const message = messages[0]
    const from = message.from
    const messageId = message.id
    const supabase = getSupabase()

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('whatsapp_number', from)
      .single()

    if (!user) {
      try { await sendWhatsAppMessage(from, 'No encontré tu cuenta en FlowDesk. Regístrate en nuestra app web primero.') } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    let textContent = ''
    if (message.type === 'text') {
      textContent = message.text.body
    } else if (message.type === 'audio') {
      const mediaId = message.audio.id
      const { data: audioData, mimeType } = await downloadWhatsAppMedia(mediaId)
      textContent = await transcribeAudio(audioData, mimeType)
    } else {
      try { await sendWhatsAppMessage(from, 'Solo puedo procesar mensajes de texto y audios por ahora. 😊') } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    const userTimezone = user.timezone || 'America/Santiago'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone })

    // ── Si hay items pendientes esperando info, intentar completarlos ──
    const pendingItems: IntentItem[] | null = user.pending_intent || null

    if (pendingItems && pendingItems.length > 0) {
      let result
      try {
        result = await completePendingItems(pendingItems, textContent, today, userTimezone)
      } catch (e) {
        console.error('Error completando pendientes:', e)
        await supabase.from('users').update({ pending_intent: null }).eq('id', user.id)
        try { await sendWhatsAppMessage(from, 'Tuve un problema retomando la conversación. Intenta de nuevo. 😅') } catch (e2) {}
        return NextResponse.json({ ok: true })
      }

      // Procesar los items que quedaron completos
      await Promise.all(
        result.completed.map(item => processItem(item, user, textContent, today, messageId, supabase))
      )

      // Guardar los que siguen pendientes (o limpiar si ya no hay)
      await supabase.from('users').update({
        pending_intent: result.stillPending.length > 0 ? result.stillPending : null
      }).eq('id', user.id)

      // Guardar en bitácora
      await supabase.from('diary_entries').insert({
        user_id: user.id,
        content: textContent,
        entry_date: today,
        whatsapp_message_id: messageId,
      })

      try { await sendWhatsAppMessage(from, result.response) } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    // ── Flujo normal ──
    let intent
    try {
      intent = await analyzeMessage(textContent, today, userTimezone)
    } catch (aiError: any) {
      const isRateLimit = aiError?.message?.includes('429') || aiError?.status === 429
      const msg = isRateLimit
        ? 'Estoy procesando muchos mensajes, espera un momento. 🙏'
        : 'Tuve un problema procesando tu mensaje. Intenta de nuevo. 😅'
      try { await sendWhatsAppMessage(from, msg) } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    // Separar items completos de incompletos
    const readyItems = intent.items.filter(i => !i.needs_info || i.needs_info.length === 0)
    const incompleteItems = intent.items.filter(i => i.needs_info && i.needs_info.length > 0)

    // Procesar los completos de inmediato
    await Promise.all(
      readyItems.map(item => processItem(item, user, textContent, today, messageId, supabase))
    )

    // Guardar pendientes si los hay
    if (incompleteItems.length > 0) {
      await supabase.from('users').update({ pending_intent: incompleteItems }).eq('id', user.id)
    }

    // Guardar en bitácora
    await supabase.from('diary_entries').insert({
      user_id: user.id,
      content: textContent,
      entry_date: today,
      whatsapp_message_id: messageId,
    })

    try { await sendWhatsAppMessage(from, intent.response) } catch (e) {}
    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('Error procesando mensaje WhatsApp:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
