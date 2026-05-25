import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { deleteCalendarEvent } from '@/lib/google-calendar'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
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

  const adminSupabase = getSupabase()
  const { data: event } = await adminSupabase
    .from('calendar_events')
    .select('google_event_id, start_time')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!event) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const updates: Record<string, string> = {}
  if (body.title) updates.title = body.title
  if (body.start_time) updates.start_time = body.start_time
  if (body.end_time) updates.end_time = body.end_time
  if (body.description !== undefined) updates.description = body.description

  const { data: updated, error } = await adminSupabase
    .from('calendar_events')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (event.google_event_id) {
    const { data: profile } = await adminSupabase
      .from('users')
      .select('google_access_token, google_refresh_token')
      .eq('id', user.id)
      .single()

    if (profile?.google_access_token) {
      try {
        const { updateCalendarEvent } = await import('@/lib/google-calendar')
        await updateCalendarEvent({
          accessToken: profile.google_access_token,
          refreshToken: profile.google_refresh_token,
          googleEventId: event.google_event_id,
          title: body.title,
          description: body.description,
          startTime: body.start_time,
          endTime: body.end_time,
        })
      } catch (e) {
        console.error('Error actualizando Google Calendar:', e)
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

  const adminSupabase = getSupabase()
  const { data: event } = await adminSupabase
    .from('calendar_events')
    .select('google_event_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!event) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  if (event.google_event_id) {
    const { data: profile } = await adminSupabase
      .from('users')
      .select('google_access_token, google_refresh_token')
      .eq('id', user.id)
      .single()

    if (profile?.google_access_token) {
      try {
        await deleteCalendarEvent({
          accessToken: profile.google_access_token,
          refreshToken: profile.google_refresh_token,
          googleEventId: event.google_event_id,
        })
      } catch (e) {
        console.error('Error eliminando evento de Google Calendar:', e)
      }
    }
  }

  const { error } = await adminSupabase
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
