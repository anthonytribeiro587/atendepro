import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage, type WhatsAppCredentials } from '@/lib/whatsapp'

export type BusinessAlertConfig = {
  id: string
  name: string
  slug: string | null
  timezone: string | null
  owner_notification_phone: string | null
  notify_owner_new_booking: boolean | null
  notify_owner_daily_summary: boolean | null
  owner_daily_summary_time: string | null
  notify_owner_next_appointment: boolean | null
  owner_next_appointment_minutes: number | null
  evolution_enabled: boolean | null
  evolution_api_url: string | null
  evolution_api_key: string | null
  evolution_instance: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
}

export type InternalNotificationInput = {
  businessId: string
  type: string
  title: string
  body: string
  href?: string | null
  refId?: string | null
}

export const BUSINESS_ALERT_SELECT = `
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
`

export function getBusinessWhatsAppCredentials(business: BusinessAlertConfig): WhatsAppCredentials {
  if (business.evolution_enabled) {
    return {
      evolutionApiUrl: business.evolution_api_url,
      evolutionApiKey: business.evolution_api_key,
      evolutionInstance: business.evolution_instance,
    }
  }

  return {
    phoneNumberId: business.meta_whatsapp_phone_number_id,
    accessToken: business.meta_whatsapp_access_token,
  }
}

export function formatDatePtBr(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: timezone,
  }).format(new Date(iso))
}

export function formatTimePtBr(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso))
}

export async function createInternalNotification(
  supabase: SupabaseClient,
  input: InternalNotificationInput
): Promise<{ created: boolean; id?: string }> {
  const { data, error } = await supabase
    .from('business_notifications')
    .insert({
      business_id: input.businessId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      ref_id: input.refId ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { created: false }
    console.error('[business-alerts] internal notification:', error.message)
    return { created: false }
  }

  return { created: true, id: data.id }
}

export async function notifyNewOnlineBooking(options: {
  supabase: SupabaseClient
  businessId: string
  appointmentId: string
  clientName: string
  clientPhone?: string | null
  serviceName: string
  startsAt: string
  employeeName?: string | null
}): Promise<void> {
  const { supabase, businessId, appointmentId } = options
  const { data, error } = await supabase
    .from('businesses')
    .select(BUSINESS_ALERT_SELECT)
    .eq('id', businessId)
    .maybeSingle()

  if (error || !data) {
    console.error('[business-alerts] business lookup:', error?.message ?? 'business not found')
    return
  }

  const business = data as BusinessAlertConfig
  const timezone = business.timezone || 'America/Sao_Paulo'
  const date = formatDatePtBr(options.startsAt, timezone)
  const time = formatTimePtBr(options.startsAt, timezone)
  const phoneLine = options.clientPhone ? `\n*Telefone:* ${options.clientPhone}` : ''
  const employeeLine = options.employeeName ? `\n*Profissional:* ${options.employeeName}` : ''
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  const bookingHref = '/booking'

  await createInternalNotification(supabase, {
    businessId,
    type: 'new_booking',
    title: 'Novo agendamento online',
    body: `${options.clientName} agendou ${options.serviceName} para ${date} às ${time}.`,
    href: bookingHref,
    refId: appointmentId,
  })

  if (!business.notify_owner_new_booking || !business.owner_notification_phone) return

  const message = [
    '📅 *Novo agendamento no AtendePRO*',
    '',
    `*Cliente:* ${options.clientName}`,
    `*Serviço:* ${options.serviceName}`,
    `*Data:* ${date}`,
    `*Horário:* ${time}${employeeLine}${phoneLine}`,
    '',
    appUrl ? `Ver na agenda:\n${appUrl}${bookingHref}` : 'Abra o AtendePRO para ver os detalhes.',
    '',
    `— ${business.name}`,
  ].join('\n')

  const sent = await sendWhatsAppMessage(
    business.owner_notification_phone,
    message,
    getBusinessWhatsAppCredentials(business)
  )

  if (!sent) {
    console.error('[business-alerts] owner WhatsApp was not sent:', appointmentId)
  }
}
