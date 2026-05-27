import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const q = searchParams.get('q')

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let query = supabase
    .from('diary_entries')
    .select('*')
    .eq('user_id', user.id)
    .neq('content', '__processing__')
    .order('created_at', { ascending: false })

  if (date && !q) {
    query = query.eq('entry_date', date)
  }

  if (q) {
    query = query.ilike('content', `%${q}%`)
  }

  const { data: entries, error } = await query.limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries })
}
