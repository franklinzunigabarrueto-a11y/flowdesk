import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { createCalendarEvent } from '@/lib/google-calendar'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('start_time', { ascending: true })

  const rangeStart = searchParams.get('start')
  const rangeEnd   = searchParams.get('end')

  if (rangeStart && rangeEnd) {
    query = query.gte('start_time', rangeStart).lte('start_time', rangeEnd + 'T23:59:59')
  } else if (month && year) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = Number(month) === 12
      ? `${Number(year) + 1}-01-01`
      : `${year}-${String(Number(month) + 1).padStart(2, '0')}-01`
    query = query.gte('start_time', start).lt('start_time', nextMonth)
  }

  const { data: dbEvents, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = (dbEvents || []).map(e => ({
    id: e.id,
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    description: e.description,
    color: e.color || '#f97316',
    image_url: e.image_url || null,
  }))

  return NextResponse.json({ events })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()
  const adminDb = getAdminDb()

  const { data: event, error } = await adminDb
    .from('calendar_events')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync to Google Calendar
  const { data: profile } = await adminDb
    .from('users')
    .select('google_access_token, google_refresh_token')
    .eq('id', user.id)
    .single()

  if (profile?.google_access_token && event) {
    try {
      const { googleEventId } = await createCalendarEvent({
        accessToken:  profile.google_access_token,
        refreshToken: profile.google_refresh_token,
        userId:  user.id,
        adminDb,
        title:       event.title,
        description: event.description,
        startTime:   event.start_time,
        endTime:     event.end_time,
      })
      await adminDb
        .from('calendar_events')
        .update({ google_event_id: googleEventId })
        .eq('id', event.id)
      event.google_event_id = googleEventId
    } catch (e) {
      console.error('[google calendar create error]', e)
    }
  }

  return NextResponse.json({ event })
}
