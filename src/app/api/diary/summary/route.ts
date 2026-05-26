import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { generateDiarySummary } from '@/lib/gemini'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'Fecha requerida' }, { status: 400 })

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: entries, error } = await supabase
    .from('diary_entries')
    .select('content, created_at, audio_url, image_url')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .order('created_at', { ascending: true })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entries || entries.length === 0) {
    return NextResponse.json({ summary: null, suggestions: [] })
  }

  try {
    const result = await generateDiarySummary(entries, date)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[diary/summary] Gemini error:', e)
    return NextResponse.json({ summary: null, suggestions: [], aiError: true })
  }
}
