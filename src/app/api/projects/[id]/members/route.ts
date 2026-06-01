/**
 * GET /api/projects/[id]/members
 *
 * Lista los usuarios de Flowdesk disponibles para asignar como responsables
 * de tareas del cronograma. Por ahora devuelve todos los usuarios registrados
 * (el sistema es mono-usuario, pero el endpoint está diseñado para escalar
 * a equipos con roles).
 *
 * Respuesta: { members: [{ id, name, email, whatsapp_number, avatar_url }] }
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar que el usuario tiene acceso al proyecto
  const { data: project } = await supabase
    .from('projects').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // Devolver todos los usuarios registrados en Flowdesk
  // (campos seguros, sin datos sensibles)
  const { data: members, error } = await supabase
    .from('users')
    .select('id, name, email, whatsapp_number, avatar_url')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ members: members ?? [] })
}
