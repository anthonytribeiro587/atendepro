import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  getBusinessWhatsAppCredentials,
  type BusinessAlertConfig,
} from '@/lib/business-alerts'
import { normalizeWhatsAppNumber, sendWhatsAppMessage } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonError(error: string, message: string, status = 400) {
  return NextResponse.json({ error, message }, { status })
}

function cleanPhone(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const number = normalizeWhatsAppNumber(value)
  return number.length >= 12 ? number : null
}

function cleanTime(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return '20:00'
  return value
}

function cleanMinutes(value: unknown): number {
  const number = Number(value)
  return [15, 30, 60, 90, 120].includes(number) ? number : 30
}

export async function POST(request: NextRequest) {
  try {
    const authClient = createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return jsonError('unauthorized', 'Faça login novamente.', 401)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonError('server_not_configured', 'As credenciais do Supabase não estão configuradas.', 500)
    }

    const body = await request.json() as {
      action?: 'save' | 'test'
      phone?: string
      notifyNewBooking?: boolean
      notifyDailySummary?: boolean
      dailySummaryTime?: string
      notifyNextAppointment?: boolean
      nextAppointmentMinutes?: number
    }

    const phone = cleanPhone(body.phone)
    if (body.phone?.trim() && !phone) {
      return jsonError('invalid_phone', 'Informe o número no formato 55 + DDD + telefone.')
    }

    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: business, error: lookupError } = await admin
      .from('businesses')
      .select(`
        id, name, slug, timezone,
        owner_notification_phone,
        notify_owner_new_booking,
        notify_owner_daily_summary,
        owner_daily_summary_time,
        notify_owner_next_appointment,
        owner_next_appointment_minutes,
        evolution_enabled,
        evolution_api_url,
        evolution_api_key,
        evolution_instance,
        meta_whatsapp_phone_number_id,
        meta_whatsapp_access_token
      `)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      const migrationMissing = lookupError.message.includes('owner_notification_') || lookupError.message.includes('notify_owner_')
      return jsonError(
        'business_lookup_failed',
        migrationMissing
          ? 'Execute a migration 031_business_owner_notifications.sql no Supabase.'
          : lookupError.message,
        500
      )
    }
    if (!business) return jsonError('business_not_found', 'Empresa não encontrada.', 404)

    const config = {
      owner_notification_phone: phone,
      notify_owner_new_booking: body.notifyNewBooking !== false,
      notify_owner_daily_summary: body.notifyDailySummary !== false,
      owner_daily_summary_time: cleanTime(body.dailySummaryTime),
      notify_owner_next_appointment: Boolean(body.notifyNextAppointment),
      owner_next_appointment_minutes: cleanMinutes(body.nextAppointmentMinutes),
    }

    const { error: updateError } = await admin
      .from('businesses')
      .update(config)
      .eq('id', business.id)
      .eq('owner_id', user.id)

    if (updateError) {
      return jsonError('save_failed', updateError.message, 500)
    }

    if (body.action === 'test') {
      if (!phone) return jsonError('phone_required', 'Informe o WhatsApp que receberá os avisos.')

      const updatedBusiness = { ...business, ...config } as BusinessAlertConfig
      const sent = await sendWhatsAppMessage(
        phone,
        [
          '✅ *Avisos do AtendePRO configurados!*',
          '',
          `Este número receberá os novos agendamentos e os resumos da agenda do ${business.name}.`,
          '',
          'A central de notificações dentro do sistema também já está ativa.',
        ].join('\n'),
        getBusinessWhatsAppCredentials(updatedBusiness)
      )

      if (!sent) {
        return jsonError(
          'test_failed',
          'Não foi possível enviar. Confira se a Evolution está conectada e tente novamente.',
          502
        )
      }

      return NextResponse.json({
        ok: true,
        message: 'Configurações salvas e mensagem de teste enviada.',
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Avisos para o negócio salvos com sucesso.',
    })
  } catch (error) {
    return jsonError(
      'internal_error',
      error instanceof Error ? error.message : 'Erro interno ao salvar os avisos.',
      500
    )
  }
}
