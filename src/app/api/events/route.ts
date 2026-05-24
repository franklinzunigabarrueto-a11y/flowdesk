import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

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

  if (month && year) {
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
  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event })
}
