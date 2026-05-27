import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { createFlowDeskCalendar } from '@/lib/google-calendar'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const adminDb = getAdminDb()
  const { data: profile } = await adminDb
    .from('users')
    .select('google_access_token, google_refresh_token, flowdesk_calendar_id')
    .eq('id', user.id)
    .single()

  if (!profile?.google_access_token) {
    return NextResponse.json({ error: 'Sin acceso a Google Calendar' }, { status: 400 })
  }

  // Reuse existing calendar if already created
  if (profile.flowdesk_calendar_id) {
    return NextResponse.json({ calendarId: profile.flowdesk_calendar_id })
  }

  try {
    const calendarId = await createFlowDeskCalendar({
      accessToken:  profile.google_access_token,
      refreshToken: profile.google_refresh_token,
      userId:       user.id,
      adminDb,
    })
    return NextResponse.json({ calendarId })
  } catch (e) {
    console.error('[setup calendar error]', e)
    return NextResponse.json({ error: 'Error al crear el calendario' }, { status: 500 })
  }
}
