import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'business-branding'
const MAX_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function extractStoragePath(url: string | null): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const index = url.indexOf(marker)
  if (index < 0) return null
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0])
}

async function context() {
  const auth = createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Credenciais do Supabase não configuradas.')

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id, logo_url')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (businessError) throw new Error(businessError.message)
  if (!business) return null

  return { admin, business }
}

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.storage.getBucket(BUCKET)
  if (data) return

  const { error: createError } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE,
    allowedMimeTypes: Object.keys(ALLOWED_TYPES),
  })

  if (createError && !/already exists|duplicate/i.test(createError.message)) {
    throw new Error(`Não foi possível preparar o armazenamento: ${createError.message}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await context()
    if (!ctx) return error('Faça login novamente.', 401)

    const formData = await request.formData()
    const uploaded = formData.get('logo')
    if (!(uploaded instanceof File)) return error('Selecione uma imagem para enviar.')

    const extension = ALLOWED_TYPES[uploaded.type]
    if (!extension) return error('Formato inválido. Use PNG, JPG ou WebP.')
    if (uploaded.size <= 0) return error('O arquivo está vazio.')
    if (uploaded.size > MAX_SIZE) return error('A imagem deve ter no máximo 2 MB.')

    await ensureBucket(ctx.admin)

    const path = `${ctx.business.id}/logo-${randomUUID()}.${extension}`
    const bytes = Buffer.from(await uploaded.arrayBuffer())
    const { error: uploadError } = await ctx.admin.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: uploaded.type,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) return error(`Não foi possível enviar o logo: ${uploadError.message}`, 500)

    const { data: publicData } = ctx.admin.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = publicData.publicUrl

    const { error: updateError } = await ctx.admin
      .from('businesses')
      .update({ logo_url: publicUrl })
      .eq('id', ctx.business.id)

    if (updateError) {
      await ctx.admin.storage.from(BUCKET).remove([path])
      return error(`O logo foi enviado, mas não pôde ser salvo: ${updateError.message}`, 500)
    }

    const oldPath = extractStoragePath(ctx.business.logo_url)
    if (oldPath && oldPath !== path) {
      await ctx.admin.storage.from(BUCKET).remove([oldPath]).catch(() => undefined)
    }

    return NextResponse.json({ logo_url: publicUrl })
  } catch (caught) {
    console.error('[business/logo] upload:', caught)
    return error(caught instanceof Error ? caught.message : 'Erro interno ao enviar o logo.', 500)
  }
}

export async function DELETE() {
  try {
    const ctx = await context()
    if (!ctx) return error('Faça login novamente.', 401)

    const { error: updateError } = await ctx.admin
      .from('businesses')
      .update({ logo_url: null })
      .eq('id', ctx.business.id)

    if (updateError) return error(updateError.message, 500)

    const oldPath = extractStoragePath(ctx.business.logo_url)
    if (oldPath) {
      await ctx.admin.storage.from(BUCKET).remove([oldPath]).catch(() => undefined)
    }

    return NextResponse.json({ ok: true })
  } catch (caught) {
    console.error('[business/logo] remove:', caught)
    return error(caught instanceof Error ? caught.message : 'Erro interno ao remover o logo.', 500)
  }
}
