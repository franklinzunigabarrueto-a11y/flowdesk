import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { sendWelcomeMessage } from '@/lib/whatsapp'

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

    // Check if there was a number before (to detect first-time linking)
    const { data: existing } = await supabase
      .from('users')
      .select('whatsapp_number, name')
      .eq('id', authUser.id)
      .single()

    const isFirstTime = !existing?.whatsapp_number

    const { error } = await supabase
      .from('users')
      .update({ whatsapp_number: cleaned })
      .eq('id', authUser.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Send welcome only when linking for the first time
    if (isFirstTime) {
      const name = existing?.name || authUser.user_metadata?.full_name || 'Usuario'
      try {
        await sendWelcomeMessage(cleaned, name)
      } catch (e) {
        console.error('[profile] welcome message failed:', e)
        // Non-fatal — number was saved, just log the failure
      }
    }
  }

  return NextResponse.json({ ok: true })
}
