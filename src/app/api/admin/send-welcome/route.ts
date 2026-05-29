import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWelcomeMessage } from '@/lib/whatsapp'

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminDb()

  const { data: users } = await db
    .from('users')
    .select('id, name, whatsapp_number')
    .not('whatsapp_number', 'is', null)

  if (!users?.length) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No hay usuarios con número registrado' })
  }

  const results: { name: string; number: string; status: string }[] = []

  for (const user of users) {
    try {
      await sendWelcomeMessage(user.whatsapp_number, user.name || 'Usuario')
      results.push({ name: user.name, number: user.whatsapp_number, status: 'ok' })
    } catch (e: any) {
      results.push({ name: user.name, number: user.whatsapp_number, status: `error: ${e?.message}` })
    }
  }

  console.log('[admin/send-welcome] resultados:', results)
  return NextResponse.json({ ok: true, sent: results.filter(r => r.status === 'ok').length, results })
}
