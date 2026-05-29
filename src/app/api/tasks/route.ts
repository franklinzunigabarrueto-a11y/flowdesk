import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const qMonth = searchParams.get('month')
  const qYear  = searchParams.get('year')

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let query = supabase.from('tasks').select('*').eq('user_id', user.id)

  if (qMonth && qYear) {
    const y = parseInt(qYear), m = parseInt(qMonth)
    const start = `${y}-${String(m).padStart(2,'0')}-01`
    const nm = m === 12 ? 1 : m + 1
    const ny = m === 12 ? y + 1 : y
    const end = `${ny}-${String(nm).padStart(2,'0')}-01`
    query = query.gte('due_date', start).lt('due_date', end)
  }

  const { data: tasks, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()
  const { data: task, error } = await supabase
    .from('tasks')
    .insert({ ...body, user_id: user.id, status: 'pending' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task })
}
