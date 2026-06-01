/**
 * /api/projects/[id]/members
 *
 * Gestión de miembros del proyecto y sus roles.
 * El dueño del proyecto siempre tiene rol "admin" (implícito, no editable).
 *
 * GET    — lista todos los miembros (incluye el dueño como admin implícito)
 * POST   — agrega un usuario como miembro con un rol
 * PATCH  — cambia el rol de un miembro existente
 * DELETE — elimina un miembro del proyecto
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

const VALID_ROLES = ['admin', 'professional'] as const

async function ownsProject(supabase: Awaited<ReturnType<typeof createServerSupabase>>, projectId: string, userId: string) {
  const { data } = await supabase
    .from('projects').select('id').eq('id', projectId).eq('user_id', userId).single()
  return !!data
}

// GET /api/projects/[id]/members
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar acceso al proyecto (dueño o miembro)
  const { data: project } = await supabase
    .from('projects').select('user_id').eq('id', id).single()
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  const isOwner = project.user_id === user.id
  const { data: ownMembership } = await supabase
    .from('schedule_project_members').select('role').eq('project_id', id).eq('user_id', user.id).single()

  if (!isOwner && !ownMembership) {
    return NextResponse.json({ error: 'Sin acceso a este proyecto' }, { status: 403 })
  }

  // Miembros explícitos
  const { data: members } = await supabase
    .from('schedule_project_members')
    .select('id, role, created_at, user:user_id(id, name, email, avatar_url, whatsapp_number)')
    .eq('project_id', id)
    .order('created_at')

  // Dueño del proyecto (admin implícito)
  const { data: ownerData } = await supabase
    .from('users').select('id, name, email, avatar_url, whatsapp_number').eq('id', project.user_id).single()

  const ownerEntry = ownerData
    ? { id: null, role: 'admin', is_owner: true, created_at: null, user: ownerData }
    : null

  // Unir: dueño primero, luego miembros explícitos (excluir dueño si aparece duplicado)
  const memberList = (members ?? [])
    .filter((m: any) => m.user?.id !== project.user_id)  // no duplicar al dueño
    .map((m: any) => ({ ...m, is_owner: false }))

  const result = ownerEntry ? [ownerEntry, ...memberList] : memberList

  return NextResponse.json({ members: result })
}

// POST /api/projects/[id]/members
// Agrega un usuario como miembro del proyecto.
// Body: { user_id, role: 'admin' | 'professional' }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!await ownsProject(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Solo el administrador puede gestionar miembros' }, { status: 403 })
  }

  const body = await req.json()
  const { user_id, role } = body

  if (!user_id) return NextResponse.json({ error: 'user_id es obligatorio' }, { status: 400 })
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role debe ser: ${VALID_ROLES.join(' o ')}` }, { status: 400 })
  }

  // No permitir agregar al propio dueño (ya es admin implícito)
  const { data: project } = await supabase.from('projects').select('user_id').eq('id', id).single()
  if (project?.user_id === user_id) {
    return NextResponse.json({ error: 'El dueño del proyecto ya es admin implícito' }, { status: 422 })
  }

  // Verificar que el usuario existe en Flowdesk
  const { data: targetUser } = await supabase.from('users').select('id, name, email').eq('id', user_id).single()
  if (!targetUser) return NextResponse.json({ error: 'Usuario no encontrado en Flowdesk' }, { status: 404 })

  const { data, error } = await supabase
    .from('schedule_project_members')
    .upsert({ project_id: id, user_id, role }, { onConflict: 'project_id,user_id' })
    .select('*, user:user_id(id, name, email, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data }, { status: 201 })
}

// PATCH /api/projects/[id]/members
// Cambia el rol de un miembro.
// Body: { user_id, role }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!await ownsProject(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Solo el administrador puede gestionar miembros' }, { status: 403 })
  }

  const body = await req.json()
  const { user_id, role } = body

  if (!user_id || !role) return NextResponse.json({ error: 'user_id y role son obligatorios' }, { status: 400 })
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role debe ser: ${VALID_ROLES.join(' o ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('schedule_project_members')
    .update({ role })
    .eq('project_id', id).eq('user_id', user_id)
    .select('*, user:user_id(id, name, email, avatar_url)')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
  return NextResponse.json({ member: data })
}

// DELETE /api/projects/[id]/members?user_id=...
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!await ownsProject(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Solo el administrador puede gestionar miembros' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })

  await supabase.from('schedule_project_members')
    .delete().eq('project_id', id).eq('user_id', userId)

  return NextResponse.json({ ok: true })
}
