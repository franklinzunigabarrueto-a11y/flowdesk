import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDiarySummary } from '@/lib/gemini'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: users } = await adminDb
    .from('users')
    .select('id, timezone')

  if (!users?.length) return NextResponse.json({ ok: true, processed: 0 })

  const results = { success: 0, skipped: 0, error: 0 }

  for (const user of users) {
    const timezone = user.timezone || 'America/Santiago'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })

    // Skip if already cached
    try {
      const { data: existing } = await adminDb
        .from('diary_summaries')
        .select('id')
        .eq('user_id', user.id)
        .eq('summary_date', today)
        .single()
      if (existing) { results.skipped++; continue }
    } catch { /* no cache */ }

    // Skip if no activity today
    const { count } = await adminDb
      .from('diary_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('entry_date', today)
      .neq('content', '__processing__')

    if (!count || count === 0) { results.skipped++; continue }

    try {
      const { data: entries } = await adminDb
        .from('diary_entries')
        .select('content, created_at, audio_url, image_url')
        .eq('user_id', user.id)
        .eq('entry_date', today)
        .neq('content', '__processing__')
        .order('created_at', { ascending: true })
        .limit(25)

      const result = await generateDiarySummary(entries || [], today)

      await adminDb.from('diary_summaries').upsert(
        { user_id: user.id, summary_date: today, summary: result.summary, suggestions: result.suggestions },
        { onConflict: 'user_id,summary_date' }
      )
      results.success++
    } catch (e) {
      console.error(`[cron/diary-summary] user ${user.id}:`, e)
      results.error++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
