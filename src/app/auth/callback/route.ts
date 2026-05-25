import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/onboarding'

  if (code) {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const { session } = data
      if (session.provider_token || session.provider_refresh_token) {
        await supabase.from('users').upsert({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name,
          avatar_url: session.user.user_metadata?.avatar_url,
          google_access_token: session.provider_token,
          google_refresh_token: session.provider_refresh_token,
        }, { onConflict: 'id' })
      }
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .single()

      const destination = profile?.onboarding_completed ? '/dashboard' : '/onboarding'
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}
