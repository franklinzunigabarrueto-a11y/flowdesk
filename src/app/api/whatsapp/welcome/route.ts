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

    await sendWelcomeMessage(phone.replace(/\D/g, ''), name)
    console.log(`[welcome] Mensaje enviado a ${phone} (${name})`)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[welcome] Error enviando bienvenida:', error?.message ?? error)
    // Return ok so onboarding doesn't block the user, but log clearly
    return NextResponse.json({ ok: true, warning: 'welcome_failed' })
  }
}
