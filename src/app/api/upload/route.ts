import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const MAX_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

async function compressImage(input: Buffer): Promise<Buffer> {
  const attempts = [
    { quality: 82, width: 1920 },
    { quality: 65, width: 1600 },
    { quality: 50, width: 1280 },
    { quality: 35, width: 1024 },
    { quality: 25, width: 800 },
  ]
  for (const { quality, width } of attempts) {
    const out = await sharp(input).resize({ width, withoutEnlargement: true }).jpeg({ quality, progressive: true }).toBuffer()
    if (out.length <= MAX_BYTES) return out
  }
  return sharp(input).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 20 }).toBuffer()
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se envió archivo' }, { status: 400 })

  const isImage = IMAGE_TYPES.includes(file.type)

  // Non-image files must be under 2MB directly
  if (!isImage && file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El archivo supera 2 MB' }, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let buffer = Buffer.from(await file.arrayBuffer()) as Buffer
  let ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  let contentType = file.type

  // Compress images that exceed 2MB
  if (isImage && buffer.length > MAX_BYTES) {
    buffer = await compressImage(buffer)
    ext = 'jpg'
    contentType = 'image/jpeg'
  }

  const path = `${user.id}/${Date.now()}.${ext}`
  const { error } = await adminSupabase.storage
    .from('attachments')
    .upload(path, buffer, { contentType, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = adminSupabase.storage
    .from('attachments')
    .getPublicUrl(path)

  return NextResponse.json({ url: publicUrl })
}
