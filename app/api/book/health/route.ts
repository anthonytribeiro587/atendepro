import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

function decodeJwtRole(token?: string): string | null {
  if (!token) return null
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as { role?: string }
    return json.role ?? null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') || 'salo-do-anthony'
  const checks: Record<string, unknown> = {
    supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    serviceKeyRole: decodeJwtRole(process.env.SUPABASE_SERVICE_ROLE_KEY),
  }

  try {
    const supabase = createServiceClient()

    const businessResult = await supabase
      .from('businesses')
      .select('id, name, timezone')
      .eq('slug', slug)
      .maybeSingle()

    checks.business = businessResult.error
      ? { ok: false, code: businessResult.error.code, message: businessResult.error.message }
      : { ok: Boolean(businessResult.data), id: businessResult.data?.id ?? null }

    if (!businessResult.data) {
      return NextResponse.json({ ok: false, slug, checks }, { status: 500 })
    }

    const businessId = businessResult.data.id
    const [serviceResult, clientsResult, appointmentsResult] = await Promise.all([
      supabase
        .from('services')
        .select('id, name, duration_min, price, is_active')
        .eq('business_id', businessId)
        .limit(1),
      supabase
        .from('clients')
        .select('id, name, phone, email, telegram_id, viber_id')
        .eq('business_id', businessId)
        .limit(1),
      supabase
        .from('appointments')
        .select('id, business_id, client_id, employee_id, service_id, starts_at, ends_at, status, price, source')
        .eq('business_id', businessId)
        .limit(1),
    ])

    checks.services = serviceResult.error
      ? { ok: false, code: serviceResult.error.code, message: serviceResult.error.message }
      : { ok: true, count: serviceResult.data?.length ?? 0 }
    checks.clientsSchema = clientsResult.error
      ? { ok: false, code: clientsResult.error.code, message: clientsResult.error.message }
      : { ok: true }
    checks.appointmentsSchema = appointmentsResult.error
      ? { ok: false, code: appointmentsResult.error.code, message: appointmentsResult.error.message }
      : { ok: true }

    const ok = Object.values(checks).every((value) => {
      if (!value || typeof value !== 'object' || !('ok' in value)) return true
      return (value as { ok?: boolean }).ok !== false
    }) && checks.serviceKeyRole === 'service_role'

    return NextResponse.json({ ok, slug, checks }, { status: ok ? 200 : 500 })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        slug,
        checks,
        fatal: error instanceof Error ? error.message : 'unknown_error',
      },
      { status: 500 }
    )
  }
}
