import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const adminDb = getAdminDb()

  const { data: event } = await adminDb
    .from('calendar_events')
    .select('google_event_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!event) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const updates: Record<string, any> = {}
  if (body.title       !== undefined) updates.title       = body.title
  if (body.start_time  !== undefined) updates.start_time  = body.start_time
  if (body.end_time    !== undefined) updates.end_time    = body.end_time
  if (body.description !== undefined) updates.description = body.description
  if (body.image_url   !== undefined) updates.image_url   = body.image_url
  if (body.completed   !== undefined) updates.completed   = body.completed

  const { data: updated, error } = await adminDb
    .from('calendar_events')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (event.google_event_id) {
    const { data: profile } = await adminDb
      .from('users')
      .select('google_access_token, google_refresh_token, flowdesk_calendar_id')
      .eq('id', user.id)
      .single()

    if (profile?.google_access_token) {
      try {
        await updateCalendarEvent({
          accessToken:    profile.google_access_token,
          refreshToken:   profile.google_refresh_token,
          userId:         user.id,
          adminDb,
          googleEventId:  event.google_event_id,
          calendarId:     profile.flowdesk_calendar_id || 'primary',
          title:          body.title,
          description:    body.description,
          startTime:      body.start_time,
          endTime:        body.end_time,
        })
      } catch (e) {
        console.error('[google calendar update error]', e)
      }
    }
  }

  return NextResponse.json({ event: updated })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const adminDb = getAdminDb()

  const { data: event } = await adminDb
    .from('calendar_events')
    .select('google_event_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!event) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  if (event.google_event_id) {
    const { data: profile } = await adminDb
      .from('users')
      .select('google_access_token, google_refresh_token, flowdesk_calendar_id')
      .eq('id', user.id)
      .single()

    if (profile?.google_access_token) {
      try {
        await deleteCalendarEvent({
          accessToken:   profile.google_access_token,
          refreshToken:  profile.google_refresh_token,
          userId:        user.id,
          adminDb,
          googleEventId: event.google_event_id,
          calendarId:    profile.flowdesk_calendar_id || 'primary',
        })
      } catch (e) {
        console.error('[google calendar delete error]', e)
      }
    }
  }

  const { error } = await adminDb
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
