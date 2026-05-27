import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { registerWatch } from '@/lib/google-calendar'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Called from the client on dashboard mount.
 * Registers (or renews) the Google Calendar push-notification channel.
 * Skips registration if the existing channel is still valid for > 24 hours.
 */
export async function POST() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const adminDb = getAdminDb()
  const { data: profile } = await adminDb
    .from('users')
    .select('google_access_token, google_refresh_token, google_channel_expiry, flowdesk_calendar_id')
    .eq('id', user.id)
    .single()

  if (!profile?.google_access_token) {
    return NextResponse.json({ ok: true, skipped: 'no_google_token' })
  }

  // Skip if channel is still valid for more than 24 hours
  const expiry = Number(profile.google_channel_expiry || 0)
  if (expiry && Date.now() < expiry - 24 * 3600 * 1000) {
    return NextResponse.json({ ok: true, skipped: 'channel_valid' })
  }

  try {
    await registerWatch({
      userId:                user.id,
      accessToken:           profile.google_access_token,
      refreshToken:          profile.google_refresh_token,
      adminDb,
      flowdeskCalendarId:    profile.flowdesk_calendar_id,
    })
    return NextResponse.json({ ok: true, registered: true })
  } catch (e: any) {
    console.error('[google-sync register]', e)
    return NextResponse.json({ ok: true, error: e.message })
  }
}
