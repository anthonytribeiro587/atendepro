import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function getBusinessId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, businessId: null }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return { supabase, businessId: business?.id ?? null }
}

export async function GET() {
  const { supabase, businessId } = await getBusinessId()
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // business_notifications was added after the generated Supabase database
  // types. Keep this route runtime-typed until those generated types are updated.
  const notificationsClient = supabase as unknown as SupabaseClient

  const { data, error } = await notificationsClient
    .from('business_notifications')
    .select('id, type, title, body, href, read_at, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    const missingMigration = error.message.includes('business_notifications')
    return NextResponse.json(
      {
        error: 'load_failed',
        message: missingMigration
          ? 'Execute a migration 031_business_owner_notifications.sql no Supabase.'
          : error.message,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    notifications: data ?? [],
    unread: (data ?? []).filter((item: { read_at: string | null }) => !item.read_at).length,
  })
}

export async function PATCH(request: NextRequest) {
  const { supabase, businessId } = await getBusinessId()
  if (!businessId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { id?: string; all?: boolean }
  const notificationsClient = supabase as unknown as SupabaseClient

  let query = notificationsClient
    .from('business_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .is('read_at', null)

  if (!body.all) {
    if (!body.id) return NextResponse.json({ error: 'notification_id_required' }, { status: 422 })
    query = query.eq('id', body.id)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
