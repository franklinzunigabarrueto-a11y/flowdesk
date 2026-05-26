import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json()
  const { whatsapp_number } = body

  if (whatsapp_number !== undefined) {
    const cleaned = String(whatsapp_number).replace(/\D/g, '')
    if (cleaned.length < 8) {
      return NextResponse.json({ error: 'Número inválido. Incluye el código de país (ej: 56912345678).' }, { status: 400 })
    }
    const { error } = await supabase
      .from('users')
      .update({ whatsapp_number: cleaned })
      .eq('id', authUser.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
