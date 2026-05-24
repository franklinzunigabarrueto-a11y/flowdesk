import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { sendWelcomeMessage } from '@/lib/whatsapp'

export async function POST(request: Request) {
  try {
    const { phone, name } = await request.json()
    if (!phone || !name) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    await sendWelcomeMessage(phone, name)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error enviando bienvenida:', error)
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 })
  }
}
