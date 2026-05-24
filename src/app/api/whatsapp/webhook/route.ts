import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analyzeMessage, transcribeAudio, IntentItem } from '@/lib/gemini'
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

async function processIntent(
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
      try {
        await sendWhatsAppMessage(from, 'No encontré tu cuenta en FlowDesk. Regístrate en nuestra app web primero.')
      } catch (e) {
        console.error('Error enviando mensaje a usuario no registrado:', e)
      }
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
      try {
        await sendWhatsAppMessage(from, 'Solo puedo procesar mensajes de texto y audios por ahora. 😊')
      } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    const userTimezone = user.timezone || 'America/Santiago'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone })

    let intent
    try {
      intent = await analyzeMessage(textContent, today, userTimezone)
    } catch (aiError: any) {
      const isRateLimit = aiError?.message?.includes('429') || aiError?.status === 429
      const msg = isRateLimit
        ? 'Estoy procesando muchos mensajes, espera un momento e intenta de nuevo. 🙏'
        : 'Tuve un problema procesando tu mensaje. Intenta de nuevo en unos segundos. 😅'
      try { await sendWhatsAppMessage(from, msg) } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    // Guardar el texto en la bitácora si hay contenido relevante
    const diaryTypes = ['diary', 'task_complete', 'unknown']
    const hasNonDiaryItem = intent.items.some(i => !diaryTypes.includes(i.type))
    const hasDiaryItem = intent.items.some(i => diaryTypes.includes(i.type))

    // Siempre guardar en bitácora
    await supabase.from('diary_entries').insert({
      user_id: user.id,
      content: textContent,
      entry_date: today,
      whatsapp_message_id: messageId,
    })

    // Procesar todos los items en paralelo
    await Promise.all(
      intent.items.map(item => processIntent(item, user, textContent, today, messageId, supabase))
    )

    try {
      await sendWhatsAppMessage(from, intent.response)
    } catch (e) {
      console.error('Error enviando respuesta WhatsApp:', e)
    }

    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('Error procesando mensaje WhatsApp:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
