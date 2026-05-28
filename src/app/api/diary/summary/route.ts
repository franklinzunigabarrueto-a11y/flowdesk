import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { generateDiarySummary } from '@/lib/gemini'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isAfter6PM(timezone: string): boolean {
  const hour = parseInt(
    new Date().toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false })
  )
  return hour >= 18
}

function getUTCRangeForLocalDate(localDate: string, timezone: string) {
  const now = new Date()
  const offsetMs =
    new Date(now.toLocaleString('en-US', { timeZone: timezone })).getTime() -
    new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const [y, m, d] = localDate.split('-').map(Number)
  const utcStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs)
  const utcEnd   = new Date(utcStart.getTime() + 86_400_000)
  return { start: utcStart.toISOString(), end: utcEnd.toISOString() }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'Fecha requerida' }, { status: 400 })

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('timezone').eq('id', user.id).single()
  const timezone = profile?.timezone || 'America/Santiago'
  const adminDb  = getAdminDb()

  const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: timezone })

  // ── 1. Return cached summary if available (max 30 days old) ──
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const { data: cached } = await adminDb
      .from('diary_summaries')
      .select('summary, suggestions')
      .eq('user_id', user.id)
      .eq('summary_date', date)
      .gte('summary_date', thirtyDaysAgo)
      .single()
    if (cached?.summary) {
      return NextResponse.json({ summary: cached.summary, suggestions: cached.suggestions ?? [] })
    }
  } catch { /* table may not exist yet */ }

  // ── 2. Past day with no cache → never regenerate ──
  if (date < todayLocal) {
    return NextResponse.json({ summary: null, suggestions: [] })
  }

  // ── 3. Today before 18:00 → pending state ──
  if (!isAfter6PM(timezone)) {
    return NextResponse.json({ summary: null, suggestions: [], pending: true })
  }

  // ── 4. Today after 18:00 → generate once ──
  const { start: utcStart, end: utcEnd } = getUTCRangeForLocalDate(date, timezone)

  const [
    { data: diaryEntries },
    { data: events },
    { data: tasks },
  ] = await Promise.all([
    adminDb.from('diary_entries')
      .select('content, created_at, audio_url, image_url')
      .eq('user_id', user.id)
      .eq('entry_date', date)
      .neq('content', '__processing__')
      .order('created_at', { ascending: true })
      .limit(25),
    adminDb.from('calendar_events')
      .select('title, start_time, created_at')
      .eq('user_id', user.id)
      .is('whatsapp_message_id', null)
      .gte('start_time', utcStart)
      .lt('start_time', utcEnd)
      .order('start_time', { ascending: true }),
    adminDb.from('tasks')
      .select('title, priority, due_date, created_at')
      .eq('user_id', user.id)
      .is('whatsapp_message_id', null)
      .eq('due_date', date)
      .order('created_at', { ascending: true }),
  ])

  const allEntries = [
    ...(diaryEntries || []),
    ...(events || []).map(ev => ({
      content: `📅 Evento creado en app: "${ev.title}"${ev.start_time
        ? ` — programado ${new Date(ev.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: timezone })}`
        : ''}`,
      created_at: ev.created_at,
      audio_url: null as null,
      image_url: null as null,
    })),
    ...(tasks || []).map(t => ({
      content: `✅ Tarea creada en app: "${t.title}"${t.priority ? ` — prioridad ${t.priority}` : ''}${t.due_date ? ` — para el ${t.due_date}` : ''}`,
      created_at: t.created_at,
      audio_url: null as null,
      image_url: null as null,
    })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (allEntries.length === 0) {
    return NextResponse.json({ summary: null, suggestions: [] })
  }

  try {
    const result = await generateDiarySummary(allEntries, date)

    // Cache result
    try {
      await adminDb.from('diary_summaries').upsert(
        { user_id: user.id, summary_date: date, summary: result.summary, suggestions: result.suggestions },
        { onConflict: 'user_id,summary_date' }
      )
    } catch { /* non-fatal if table doesn't exist */ }

    return NextResponse.json(result)
  } catch (e) {
    console.error('[diary/summary] Gemini error:', e)
    return NextResponse.json({ summary: null, suggestions: [], aiError: true })
  }
}
