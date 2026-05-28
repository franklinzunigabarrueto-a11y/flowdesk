import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { ActivityItem } from '@/types'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getUTCRangeForLocalDate(localDate: string, timezone: string) {
  const now = new Date()
  const utcMs  = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const tzMs   = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getTime()
  const offsetMs = tzMs - utcMs          // e.g. -14_400_000 for UTC-4
  const [y, m, d] = localDate.split('-').map(Number)
  const localMidnightUTC = Date.UTC(y, m - 1, d, 0, 0, 0)
  const utcStart = new Date(localMidnightUTC - offsetMs)
  const utcEnd   = new Date(utcStart.getTime() + 86_400_000)
  return { start: utcStart.toISOString(), end: utcEnd.toISOString() }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const q    = searchParams.get('q')

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('timezone').eq('id', user.id).single()
  const timezone = profile?.timezone || 'America/Santiago'

  const activities: ActivityItem[] = []

  // ── Search mode: only full-text over diary_entries ──
  if (q) {
    const { data: entries } = await supabase
      .from('diary_entries')
      .select('*')
      .eq('user_id', user.id)
      .neq('content', '__processing__')
      .ilike('content', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(50)

    for (const e of entries || []) {
      activities.push({
        id: e.id,
        source: e.audio_url ? 'whatsapp_audio' : e.image_url ? 'whatsapp_photo' : 'whatsapp_text',
        content: e.content,
        image_url: e.image_url ?? null,
        audio_url: e.audio_url ?? null,
        created_at: e.created_at,
      })
    }
    return NextResponse.json({ activities })
  }

  if (!date) return NextResponse.json({ activities: [] })

  const { start: utcStart, end: utcEnd } = getUTCRangeForLocalDate(date, timezone)

  const [
    { data: diaryEntries },
    { data: events },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('diary_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('entry_date', date)
      .neq('content', '__processing__')
      .order('created_at', { ascending: true }),

    // Only events created from web app (no whatsapp_message_id)
    supabase.from('calendar_events')
      .select('id, title, description, start_time, end_time, created_at')
      .eq('user_id', user.id)
      .is('whatsapp_message_id', null)
      .gte('created_at', utcStart)
      .lt('created_at', utcEnd)
      .order('created_at', { ascending: true }),

    // Only tasks created from web app (no whatsapp_message_id)
    supabase.from('tasks')
      .select('id, title, description, priority, due_date, status, created_at')
      .eq('user_id', user.id)
      .is('whatsapp_message_id', null)
      .gte('created_at', utcStart)
      .lt('created_at', utcEnd)
      .order('created_at', { ascending: true }),
  ])

  for (const e of diaryEntries || []) {
    activities.push({
      id: e.id,
      source: e.audio_url ? 'whatsapp_audio' : e.image_url ? 'whatsapp_photo' : 'whatsapp_text',
      content: e.content,
      image_url: e.image_url ?? null,
      audio_url: e.audio_url ?? null,
      created_at: e.created_at,
    })
  }

  for (const ev of events || []) {
    activities.push({
      id: ev.id,
      source: 'event',
      title: ev.title,
      description: ev.description,
      created_at: ev.created_at,
      meta: { start_time: ev.start_time, end_time: ev.end_time },
    })
  }

  for (const t of tasks || []) {
    activities.push({
      id: t.id,
      source: 'task',
      title: t.title,
      description: t.description,
      created_at: t.created_at,
      meta: { priority: t.priority, due_date: t.due_date },
    })
  }

  activities.sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  return NextResponse.json({ activities })
}
