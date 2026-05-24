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
