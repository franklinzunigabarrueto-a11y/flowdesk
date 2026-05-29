import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { analyzeMessage, completePendingItems, transcribeAudio, analyzeImageForQuestion, IntentItem } from '@/lib/gemini'
import { sendWhatsAppMessage, downloadWhatsAppMedia } from '@/lib/whatsapp'
import { createCalendarEvent, findCalendarByName, updateCalendarEvent } from '@/lib/google-calendar'

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

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

async function compressToUnder2MB(input: Buffer): Promise<{ buffer: Buffer; ext: string; mime: string }> {
  // Try progressive quality reductions until under 2MB
  const attempts = [
    { quality: 82, width: 1920 },
    { quality: 65, width: 1600 },
    { quality: 50, width: 1280 },
    { quality: 35, width: 1024 },
    { quality: 25, width: 800 },
  ]
  for (const { quality, width } of attempts) {
    const compressed = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, progressive: true })
      .toBuffer()
    if (compressed.length <= MAX_BYTES) {
      return { buffer: compressed, ext: 'jpg', mime: 'image/jpeg' }
    }
  }
  // Last resort: 20% quality, 640px wide
  const last = await sharp(input).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 20 }).toBuffer()
  return { buffer: last, ext: 'jpg', mime: 'image/jpeg' }
}

async function uploadImageToStorage(
  supabase: ReturnType<typeof getSupabase>,
  base64: string,
  mimeType: string,
  userId: string
): Promise<string | null> {
  try {
    let buffer = Buffer.from(base64, 'base64') as Buffer
    let ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg'
    let uploadMime = mimeType

    if (buffer.length > MAX_BYTES && !mimeType.includes('gif')) {
      console.log(`[upload] Imagen ${(buffer.length / 1024 / 1024).toFixed(2)}MB — comprimiendo...`)
      const compressed = await compressToUnder2MB(buffer)
      buffer = compressed.buffer as Buffer
      ext = compressed.ext
      uploadMime = compressed.mime
      console.log(`[upload] Comprimida a ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)
    }

    const filename = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('attachments')
      .upload(filename, buffer, { contentType: uploadMime, upsert: false })

    if (error) { console.error('Error subiendo imagen:', error); return null }

    const { data } = supabase.storage.from('attachments').getPublicUrl(filename)
    return data.publicUrl
  } catch (e) {
    console.error('Error en uploadImageToStorage:', e)
    return null
  }
}

async function processItem(
  item: IntentItem,
  user: any,
  textContent: string,
  today: string,
  messageId: string,
  supabase: ReturnType<typeof getSupabase>,
  imageUrl?: string | null
) {
  switch (item.type) {
    case 'task': {
      const { error: taskError } = await supabase.from('tasks').insert({
        user_id: user.id,
        title: item.data.title || textContent.substring(0, 80),
        description: item.data.description,
        priority: item.data.priority || 'medium',
        due_date: item.data.due_date,
        status: 'pending',
        whatsapp_message_id: messageId,
        image_url: imageUrl || null,
      })
      if (taskError) console.error('[task insert error]', taskError)
      break
    }

    case 'event': {
      if (!item.data.event_start) break
      const eventTitle = item.data.title || textContent.substring(0, 80)
      let googleEventId: string | undefined

      if (user.google_access_token) {
        try {
          const calendarId = user.flowdesk_calendar_id || 'primary'
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

      const { error: eventError } = await supabase.from('calendar_events').insert({
        user_id: user.id,
        title: eventTitle,
        description: item.data.description,
        start_time: item.data.event_start,
        end_time: item.data.event_end,
        google_event_id: googleEventId,
        whatsapp_message_id: messageId,
        image_url: imageUrl || null,
      })
      if (eventError) console.error('[event insert error]', eventError)
      break
    }

    case 'edit_event': {
      const { data: lastEvent } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!lastEvent) break

      const updates: any = {}
      if (item.data.title) updates.title = item.data.title
      if (item.data.event_start) updates.start_time = item.data.event_start
      if (item.data.event_end) updates.end_time = item.data.event_end
      if (imageUrl) updates.image_url = imageUrl

      await supabase.from('calendar_events').update(updates).eq('id', lastEvent.id)

      if (lastEvent.google_event_id && user.google_access_token) {
        try {
          await updateCalendarEvent({
            accessToken: user.google_access_token,
            refreshToken: user.google_refresh_token,
            googleEventId: lastEvent.google_event_id,
            calendarId: user.flowdesk_calendar_id || 'primary',
            title: item.data.title,
            startTime: item.data.event_start,
            endTime: item.data.event_end,
            timezone: user.timezone || 'America/Santiago',
          })
        } catch (e) {
          console.error('Error actualizando evento en Google Calendar:', e)
        }
      }
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
    let imageUrl: string | null = null
    const userTimezone = user.timezone || 'America/Santiago'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone })

    // Atomic claim: insert placeholder before slow processing to prevent duplicate execution.
    // Requires UNIQUE constraint on diary_entries.whatsapp_message_id.
    const { error: claimError } = await supabase.from('diary_entries').insert({
      user_id: user.id, content: '__processing__', entry_date: today, whatsapp_message_id: messageId,
    })
    if (claimError) {
      if (claimError.code === '23505') return NextResponse.json({ ok: true }) // already claimed
      console.error('[claim error]', claimError)
    }

    // ── Rate limit checks (before any Gemini call) ──────────────────────────
    // Uses processed diary_entries (content != '__processing__') as a proxy for
    // AI calls. On limit exceeded: delete the claim so the message can retry later.
    const BURST_LIMIT  = 5   // max per user per minute
    const HOURLY_LIMIT = 30  // max per user per hour
    const DAILY_GLOBAL = 500 // max AI calls across ALL users per day (budget guard)

    const nowIso        = new Date().toISOString()
    const oneMinuteAgo  = new Date(Date.now() - 60_000).toISOString()
    const oneHourAgo    = new Date(Date.now() - 3_600_000).toISOString()
    const todayStart    = `${today}T00:00:00.000Z`

    const [{ count: burstCount }, { count: hourlyCount }, { count: globalCount }] = await Promise.all([
      supabase.from('diary_entries').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).neq('content', '__processing__').gte('created_at', oneMinuteAgo),
      supabase.from('diary_entries').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).neq('content', '__processing__').gte('created_at', oneHourAgo),
      supabase.from('diary_entries').select('id', { count: 'exact', head: true })
        .neq('content', '__processing__').gte('created_at', todayStart),
    ])

    const deleteClaim = () =>
      supabase.from('diary_entries').delete().eq('whatsapp_message_id', messageId).eq('user_id', user.id)

    if ((burstCount ?? 0) >= BURST_LIMIT) {
      await deleteClaim()
      try { await sendWhatsAppMessage(from, '⚠️ Muchos mensajes seguidos. Espera un momento antes de continuar. 🙏') } catch (e) {}
      return NextResponse.json({ ok: true })
    }
    if ((hourlyCount ?? 0) >= HOURLY_LIMIT) {
      await deleteClaim()
      try { await sendWhatsAppMessage(from, '⚠️ Alcanzaste el límite por hora. Espera unos minutos e intenta de nuevo.') } catch (e) {}
      return NextResponse.json({ ok: true })
    }
    if ((globalCount ?? 0) >= DAILY_GLOBAL) {
      await deleteClaim()
      try { await sendWhatsAppMessage(from, '⚠️ El sistema alcanzó su límite diario de procesamiento. Podrás volver a usarlo mañana.') } catch (e) {}
      return NextResponse.json({ ok: true })
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Check if this is the first completed message of the day (ignore current __processing__ placeholder)
    const { count: todayCount } = await supabase
      .from('diary_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('entry_date', today)
      .neq('whatsapp_message_id', messageId)
      .neq('content', '__processing__')
    const isFirstMessageToday = (todayCount ?? 0) === 0

    const MAX_TEXT_LENGTH = 2000 // chars sent to Gemini — cap to limit token cost

    if (message.type === 'text') {
      textContent = message.text.body.substring(0, MAX_TEXT_LENGTH)

    } else if (message.type === 'audio') {
      try {
        const { data: audioData, mimeType } = await downloadWhatsAppMedia(message.audio.id)
        textContent = (await transcribeAudio(audioData, mimeType)).substring(0, MAX_TEXT_LENGTH)
      } catch (e: any) {
        console.error('Error transcribiendo audio — status:', e?.status, 'message:', e?.message, 'full:', JSON.stringify(e))
        await supabase.from('diary_entries').update({ content: '[audio-error]' }).eq('whatsapp_message_id', messageId).eq('user_id', user.id)
        try { await sendWhatsAppMessage(from, 'No pude procesar el audio. Intenta enviarlo de nuevo o escríbeme el mensaje. 😅') } catch (e2) {}
        return NextResponse.json({ ok: true })
      }
      if (!textContent.trim()) {
        await supabase.from('diary_entries').update({ content: '[audio-vacío]' }).eq('whatsapp_message_id', messageId).eq('user_id', user.id)
        try { await sendWhatsAppMessage(from, 'No logré entender el audio. ¿Puedes repetirlo o escribirme el mensaje?') } catch (e) {}
        return NextResponse.json({ ok: true })
      }

    } else if (message.type === 'image') {
      const { data: imgData, mimeType } = await downloadWhatsAppMedia(message.image.id)
      imageUrl = await uploadImageToStorage(supabase, imgData, mimeType, user.id)
      textContent = message.image.caption || ''

      // Si hay ítems esperando imagen (needs_image previo), procesarlos con esta foto
      const existingPending: IntentItem[] | null = user.pending_intent || null
      const awaitingItems = existingPending?.filter(i => i.type === 'awaiting_image') || []
      if (awaitingItems.length > 0 && imageUrl) {
        const remaining = existingPending!.filter(i => i.type !== 'awaiting_image')
        await supabase.from('users').update({ pending_intent: remaining.length > 0 ? remaining : null }).eq('id', user.id)
        await Promise.all(awaitingItems.map(awaitingItem => {
          const restoredItem: IntentItem = {
            type: (awaitingItem.data.event_start ? 'event' : 'task') as IntentItem['type'],
            data: awaitingItem.data,
          }
          return processItem(restoredItem, user, textContent, today, messageId, supabase, imageUrl)
        }))
        const titles = awaitingItems.map(i => `"${i.data.title}"`).join(' y ')
        try { await sendWhatsAppMessage(from, `✅ Listo, ${titles} registrado con la imagen. 📷`) } catch (e) {}
        return NextResponse.json({ ok: true })
      }

      // Sin caption → preguntar al usuario qué ocurre con la foto
      if (!textContent) {
        let question = '📷 Recibí tu foto. ¿Qué ocurre con esto? ¿Me puedes explicar para registrarlo?'
        try {
          question = await analyzeImageForQuestion(imgData, mimeType)
        } catch (e) {
          console.error('Error analizando imagen para pregunta:', e)
        }
        // Mark entry as real so subsequent messages don't think it's the first today
        await supabase.from('diary_entries')
          .update({ content: '[foto]', image_url: imageUrl || null })
          .eq('whatsapp_message_id', messageId)
          .eq('user_id', user.id)
        if (imageUrl) {
          await supabase.from('users').update({
            pending_intent: [{ type: 'pending_image', needs_info: ['description'], data: { image_url: imageUrl, confidence: 1 } }]
          }).eq('id', user.id)
        }
        try { await sendWhatsAppMessage(from, question) } catch (e) {}
        return NextResponse.json({ ok: true })
      }

    } else {
      try { await sendWhatsAppMessage(from, 'Solo puedo procesar mensajes de texto, audios e imágenes por ahora. 😊') } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    // ── Imagen pendiente (foto sin caption, usuario ahora explica) ──
    const pendingItems: IntentItem[] | null = user.pending_intent || null
    let effectiveImageUrl = imageUrl
    const pendingImageItem = pendingItems?.find(i => i.type === 'pending_image')

    if (pendingImageItem) {
      effectiveImageUrl = imageUrl || (pendingImageItem.data as any).image_url || null
      await supabase.from('users').update({ pending_intent: null }).eq('id', user.id)
      // Fall through to normal flow with the stored image attached
    } else if (pendingItems && pendingItems.length > 0) {
      // ── Pendientes esperando info ──
      let result
      try {
        result = await completePendingItems(pendingItems, textContent, today, userTimezone)
      } catch (e) {
        await supabase.from('users').update({ pending_intent: null }).eq('id', user.id)
        try { await sendWhatsAppMessage(from, 'Tuve un problema retomando la conversación. Intenta de nuevo. 😅') } catch (e2) {}
        return NextResponse.json({ ok: true })
      }

      await Promise.all(
        result.completed.map(item => processItem(item, user, textContent, today, messageId, supabase, effectiveImageUrl))
      )
      await supabase.from('users').update({
        pending_intent: result.stillPending.length > 0 ? result.stillPending : null
      }).eq('id', user.id)
      await supabase.from('diary_entries')
        .update({ content: textContent, image_url: effectiveImageUrl || null })
        .eq('whatsapp_message_id', messageId)
        .eq('user_id', user.id)
      try { await sendWhatsAppMessage(from, result.response) } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    // ── Flujo normal ──
    let intent
    try {
      intent = await analyzeMessage(textContent, today, userTimezone, user.name || '', message.type === 'image', isFirstMessageToday)
    } catch (aiError: any) {
      console.error('Gemini error:', aiError?.status, aiError?.message, JSON.stringify(aiError))
      const isRateLimit = aiError?.message?.includes('429') || aiError?.status === 429
      const msg = isRateLimit ? 'Estoy procesando muchos mensajes, espera un momento. 🙏' : 'Tuve un problema procesando tu mensaje. Intenta de nuevo. 😅'
      try { await sendWhatsAppMessage(from, msg) } catch (e) {}
      return NextResponse.json({ ok: true })
    }

    // Resolve also_calendar items: replace with event using last task's data
    const resolvedItems = await Promise.all(
      intent.items.map(async (item) => {
        if (item.type !== 'also_calendar') return item
        const { data: lastTask } = await supabase
          .from('tasks')
          .select('id, title, description, image_url')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (!lastTask) return { ...item, type: 'unknown' as const }
        return {
          type: 'event' as const,
          needs_info: item.data.event_start ? [] : ['event_start'],
          data: {
            ...item.data,
            title: item.data.title || lastTask.title,
            description: item.data.description || lastTask.description,
            confidence: 0.9,
          },
        }
      })
    )

    const needsImageItems = resolvedItems.filter(i => i.type === 'needs_image')
    const otherItems = resolvedItems.filter(i => i.type !== 'needs_image')
    const readyItems = otherItems.filter(i => !i.needs_info || i.needs_info.length === 0)
    const incompleteItems = otherItems.filter(i => i.needs_info && i.needs_info.length > 0)

    await Promise.all(
      readyItems.map(item => processItem(item, user, textContent, today, messageId, supabase, effectiveImageUrl))
    )

    const pendingToStore = [
      ...incompleteItems,
      ...needsImageItems.map(item => ({ type: 'awaiting_image' as const, data: item.data })),
    ]
    if (pendingToStore.length > 0) {
      await supabase.from('users').update({ pending_intent: pendingToStore }).eq('id', user.id)
    }

    await supabase.from('diary_entries')
      .update({ content: textContent, image_url: effectiveImageUrl || null })
      .eq('whatsapp_message_id', messageId)
      .eq('user_id', user.id)

    try { await sendWhatsAppMessage(from, intent.response) } catch (e) {}
    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('Error procesando mensaje WhatsApp:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
