/**
 * GET /api/cron/notify
 *
 * Execute periodicamente com o cabeçalho:
 * Authorization: Bearer {CRON_SECRET}
 *
 * Gatilhos:
 * - lembrete 24 horas antes;
 * - lembrete 1 hora antes;
 * - agradecimento após atendimento concluído;
 * - reativação após 30 dias sem visita;
 * - aniversário do cliente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendReminder,
  sendThankYou,
  sendReactivation,
  sendBirthday,
  formatEmailDate,
  formatEmailTime,
} from '@/lib/email'
import {
  sendTelegramMessage,
  tplReminderClient as tgTplReminderClient,
  tplThankYouClient as tgTplThankYouClient,
  tplReactivationClient as tgTplReactivationClient,
  tplBirthdayClient as tgTplBirthdayClient,
} from '@/lib/telegram'
import {
  DEFAULT_EVOLUTION_TEMPLATES,
  renderWhatsAppTemplate,
  sendWhatsAppMessage,
  type WhatsAppCredentials,
} from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

type ClientContact = {
  id?: string
  name: string
  email: string | null
  phone: string | null
  telegram_id: string | null
  business_id?: string
  birthday?: string | null
}

type BusinessConfig = {
  id?: string
  name: string
  slug: string | null
  address: string | null
  timezone: string | null
  telegram_bot_token: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
  evolution_enabled: boolean | null
  evolution_api_url: string | null
  evolution_api_key: string | null
  evolution_instance: string | null
  evolution_template_reminder_24h: string | null
  evolution_template_reminder_1h: string | null
  evolution_template_thankyou: string | null
  evolution_template_reactivation: string | null
  evolution_template_birthday: string | null
}

/**
 * O Supabase pode tipar relacionamentos aninhados como objeto ou array,
 * dependendo da relação inferida. Normalizamos os dois formatos aqui.
 */
function firstRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null
  }

  if (value && typeof value === 'object') {
    return value as T
  }

  return null
}

function getCredentials(business: BusinessConfig): WhatsAppCredentials {
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const now = new Date()
  const results: string[] = []
  const debug: Record<string, unknown> = { now: now.toISOString() }

  async function logged(businessId: string, refId: string, type: string): Promise<boolean> {
    const { error } = await supabase.from('notification_log').insert({
      business_id: businessId,
      ref_id: refId,
      type,
      channel: 'automation',
    })
    return !error
  }

  async function getBusiness(businessId: string): Promise<BusinessConfig | null> {
    const { data, error } = await supabase
      .from('businesses')
      .select(`
        id, name, slug, address, timezone, telegram_bot_token,
        meta_whatsapp_phone_number_id, meta_whatsapp_access_token,
        evolution_enabled, evolution_api_url, evolution_api_key, evolution_instance,
        evolution_template_reminder_24h, evolution_template_reminder_1h,
        evolution_template_thankyou, evolution_template_reactivation,
        evolution_template_birthday
      `)
      .eq('id', businessId)
      .maybeSingle()

    if (error) {
      console.error('[cron/notify] business lookup:', businessId, error.message)
      return null
    }
    return data as BusinessConfig | null
  }

  async function sendReminderEvent(
    appointment: {
      id: string
      starts_at: string
      business_id: string
      services: unknown
      employees: unknown
      clients: unknown
    },
    isOneHour: boolean
  ) {
    const client = firstRelation<ClientContact>(appointment.clients)
    if (!client || (!client.phone && !client.email && !client.telegram_id)) return

    const type = isOneHour ? 'reminder_1h' : 'reminder_24h'
    if (!await logged(appointment.business_id, appointment.id, type)) return

    const business = await getBusiness(appointment.business_id)
    if (!business) return

    const service = firstRelation<{ name: string }>(appointment.services)
    const employee = firstRelation<{ name: string }>(appointment.employees)
    const timezone = business.timezone || 'America/Sao_Paulo'
    const date = formatEmailDate(appointment.starts_at, timezone)
    const time = formatEmailTime(appointment.starts_at, timezone)

    if (business.telegram_bot_token && client.telegram_id) {
      await sendTelegramMessage(
        business.telegram_bot_token,
        client.telegram_id,
        tgTplReminderClient({
          clientName: client.name,
          serviceName: service?.name ?? 'Serviço',
          date,
          time,
          businessName: business.name,
          address: business.address ?? undefined,
          isOneHour,
        })
      )
    }

    if (client.phone) {
      const template = isOneHour
        ? business.evolution_template_reminder_1h
        : business.evolution_template_reminder_24h
      const fallback = isOneHour
        ? DEFAULT_EVOLUTION_TEMPLATES.reminder1h
        : DEFAULT_EVOLUTION_TEMPLATES.reminder24h

      const message = renderWhatsAppTemplate(
        template,
        {
          cliente: client.name,
          servico: service?.name ?? 'Serviço',
          data: date,
          hora: time,
          empresa: business.name,
          profissional: employee?.name,
          endereco: business.address,
          link_agendamento: business.slug ? `${APP_URL}/book/${business.slug}` : undefined,
        },
        fallback
      )
      await sendWhatsAppMessage(client.phone, message, getCredentials(business))
    }

    if (client.email) {
      try {
        await sendReminder({
          to: client.email,
          clientName: client.name,
          businessName: business.name,
          serviceName: service?.name ?? 'Serviço',
          date,
          time,
          employeeName: employee?.name ?? undefined,
          address: business.address ?? undefined,
          isOneHour,
        })
      } catch (error) {
        console.error(`[cron/notify] ${type} email:`, error)
      }
    }

    results.push(`${type}:${appointment.id}`)
  }

  // Lembretes de 24 horas.
  const from24 = new Date(now.getTime() + 23 * 3_600_000).toISOString()
  const to24 = new Date(now.getTime() + 25 * 3_600_000).toISOString()
  const { data: appointments24, error: error24 } = await supabase
    .from('appointments')
    .select('id, starts_at, business_id, services(name), employees(name), clients(name, email, phone, telegram_id)')
    .gte('starts_at', from24)
    .lte('starts_at', to24)
    .eq('status', 'confirmed')
  debug.reminder24h = { count: appointments24?.length ?? 0, error: error24?.message ?? null }

  for (const appointment of appointments24 ?? []) {
    await sendReminderEvent(appointment, false)
  }

  // Lembretes de 1 hora.
  const from1h = new Date(now.getTime() + 45 * 60_000).toISOString()
  const to1h = new Date(now.getTime() + 75 * 60_000).toISOString()
  const { data: appointments1h, error: error1h } = await supabase
    .from('appointments')
    .select('id, starts_at, business_id, services(name), employees(name), clients(name, email, phone, telegram_id)')
    .gte('starts_at', from1h)
    .lte('starts_at', to1h)
    .eq('status', 'confirmed')
  debug.reminder1h = { count: appointments1h?.length ?? 0, error: error1h?.message ?? null }

  for (const appointment of appointments1h ?? []) {
    await sendReminderEvent(appointment, true)
  }

  // Agradecimento após atendimento concluído.
  const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000).toISOString()
  const { data: completed, error: completedError } = await supabase
    .from('appointments')
    .select('id, business_id, services(name), clients(name, email, phone, telegram_id)')
    .eq('status', 'completed')
    .gte('ends_at', twoHoursAgo)
    .lte('ends_at', now.toISOString())
  debug.thankyou = { count: completed?.length ?? 0, error: completedError?.message ?? null }

  for (const appointment of completed ?? []) {
    const client = firstRelation<ClientContact>(appointment.clients)
    if (!client || (!client.phone && !client.email && !client.telegram_id)) continue
    if (!await logged(appointment.business_id, appointment.id, 'thankyou')) continue

    const business = await getBusiness(appointment.business_id)
    if (!business) continue
    const service = firstRelation<{ name: string }>(appointment.services)
    const bookingUrl = business.slug ? `${APP_URL}/book/${business.slug}` : undefined

    if (business.telegram_bot_token && client.telegram_id) {
      await sendTelegramMessage(
        business.telegram_bot_token,
        client.telegram_id,
        tgTplThankYouClient({
          clientName: client.name,
          serviceName: service?.name ?? 'Serviço',
          businessName: business.name,
          bookingUrl,
        })
      )
    }

    if (client.phone) {
      const message = renderWhatsAppTemplate(
        business.evolution_template_thankyou,
        {
          cliente: client.name,
          servico: service?.name ?? 'Serviço',
          empresa: business.name,
          link_agendamento: bookingUrl,
        },
        DEFAULT_EVOLUTION_TEMPLATES.thankyou
      )
      await sendWhatsAppMessage(client.phone, message, getCredentials(business))
    }

    if (client.email) {
      try {
        await sendThankYou({
          to: client.email,
          clientName: client.name,
          businessName: business.name,
          serviceName: service?.name ?? 'Serviço',
          bookingUrl,
        })
      } catch (error) {
        console.error('[cron/notify] thankyou email:', error)
      }
    }

    results.push(`thankyou:${appointment.id}`)
  }

  // Reativação após 30 dias.
  const reactivationStart = new Date(now)
  reactivationStart.setDate(reactivationStart.getDate() - 30)
  reactivationStart.setHours(0, 0, 0, 0)
  const reactivationEnd = new Date(reactivationStart)
  reactivationEnd.setHours(23, 59, 59, 999)

  const { data: dormant, error: dormantError } = await supabase
    .from('clients')
    .select('id, name, email, phone, telegram_id, business_id')
    .gte('last_visit_at', reactivationStart.toISOString())
    .lte('last_visit_at', reactivationEnd.toISOString())
  debug.reactivation = { count: dormant?.length ?? 0, error: dormantError?.message ?? null }

  for (const rawClient of dormant ?? []) {
    const client = rawClient as ClientContact & { id: string; business_id: string }
    if (!client.phone && !client.email && !client.telegram_id) continue
    if (!await logged(client.business_id, client.id, 'reactivation')) continue

    const business = await getBusiness(client.business_id)
    if (!business) continue
    const bookingUrl = business.slug ? `${APP_URL}/book/${business.slug}` : undefined

    if (business.telegram_bot_token && client.telegram_id) {
      await sendTelegramMessage(
        business.telegram_bot_token,
        client.telegram_id,
        tgTplReactivationClient({
          clientName: client.name,
          businessName: business.name,
          bookingUrl,
        })
      )
    }

    if (client.phone) {
      const message = renderWhatsAppTemplate(
        business.evolution_template_reactivation,
        {
          cliente: client.name,
          empresa: business.name,
          link_agendamento: bookingUrl,
        },
        DEFAULT_EVOLUTION_TEMPLATES.reactivation
      )
      await sendWhatsAppMessage(client.phone, message, getCredentials(business))
    }

    if (client.email) {
      try {
        await sendReactivation({
          to: client.email,
          clientName: client.name,
          businessName: business.name,
          bookingUrl,
        })
      } catch (error) {
        console.error('[cron/notify] reactivation email:', error)
      }
    }

    results.push(`reactivation:${client.id}`)
  }

  // Aniversários do dia, considerando o fuso brasileiro do servidor de negócio
  // para a seleção mensal/diária básica.
  const todayMonthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const { data: birthdayClients, error: birthdayError } = await supabase
    .from('clients')
    .select('id, name, email, phone, telegram_id, birthday, business_id')
    .not('birthday', 'is', null)

  const birthdays = (birthdayClients ?? []).filter(
    (client: { birthday: string | null }) => typeof client.birthday === 'string' && client.birthday.slice(5) === todayMonthDay
  )
  debug.birthday = { count: birthdays.length, error: birthdayError?.message ?? null }

  for (const rawClient of birthdays) {
    const client = rawClient as ClientContact & { id: string; business_id: string; birthday: string }
    if (!client.phone && !client.email && !client.telegram_id) continue
    const refId = `${client.id}_bday_${now.getFullYear()}`
    if (!await logged(client.business_id, refId, 'birthday')) continue

    const business = await getBusiness(client.business_id)
    if (!business) continue
    const bookingUrl = business.slug ? `${APP_URL}/book/${business.slug}` : undefined

    if (business.telegram_bot_token && client.telegram_id) {
      await sendTelegramMessage(
        business.telegram_bot_token,
        client.telegram_id,
        tgTplBirthdayClient({
          clientName: client.name,
          businessName: business.name,
          bookingUrl,
        })
      )
    }

    if (client.phone) {
      const message = renderWhatsAppTemplate(
        business.evolution_template_birthday,
        {
          cliente: client.name,
          empresa: business.name,
          link_agendamento: bookingUrl,
        },
        DEFAULT_EVOLUTION_TEMPLATES.birthday
      )
      await sendWhatsAppMessage(client.phone, message, getCredentials(business))
    }

    if (client.email) {
      try {
        await sendBirthday({
          to: client.email,
          clientName: client.name,
          businessName: business.name,
          bookingUrl,
        })
      } catch (error) {
        console.error('[cron/notify] birthday email:', error)
      }
    }

    results.push(`birthday:${client.id}`)
  }

  return NextResponse.json({ ok: true, sent: results.length, results, debug })
}
