import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  BUSINESS_ALERT_SELECT,
  createInternalNotification,
  formatDatePtBr,
  formatTimePtBr,
  getBusinessWhatsAppCredentials,
  type BusinessAlertConfig,
} from '@/lib/business-alerts'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function oneRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  }
}

function wallclockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const referenceUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const represented = localParts(referenceUtc, timezone)
  const representedMs = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    represented.hour,
    represented.minute
  )
  const offset = representedMs - referenceUtc.getTime()
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offset)
}

function tomorrowLocalRange(now: Date, timezone: string) {
  const current = localParts(now, timezone)
  const tomorrowCalendar = new Date(Date.UTC(current.year, current.month - 1, current.day + 1, 12, 0, 0))
  const year = tomorrowCalendar.getUTCFullYear()
  const month = tomorrowCalendar.getUTCMonth() + 1
  const day = tomorrowCalendar.getUTCDate()
  const start = wallclockToUtc(year, month, day, 0, 0, timezone)
  const nextCalendar = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0))
  const end = wallclockToUtc(
    nextCalendar.getUTCFullYear(),
    nextCalendar.getUTCMonth() + 1,
    nextCalendar.getUTCDate(),
    0,
    0,
    timezone
  )
  return {
    start,
    end,
    key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const now = new Date()
  const sent: string[] = []
  const debug: Record<string, unknown> = { now: now.toISOString(), businesses: [] as unknown[] }

  const { data: businesses, error: businessesError } = await supabase
    .from('businesses')
    .select(BUSINESS_ALERT_SELECT)
    .or('notify_owner_daily_summary.eq.true,notify_owner_next_appointment.eq.true')

  if (businessesError) {
    return NextResponse.json(
      {
        error: 'businesses_lookup_failed',
        message: businessesError.message.includes('notify_owner_')
          ? 'Execute a migration 031_business_owner_notifications.sql no Supabase.'
          : businessesError.message,
      },
      { status: 500 }
    )
  }

  for (const rawBusiness of businesses ?? []) {
    const business = rawBusiness as BusinessAlertConfig
    const timezone = business.timezone || 'America/Sao_Paulo'
    const businessDebug: Record<string, unknown> = { businessId: business.id, timezone }

    try {
      if (business.notify_owner_daily_summary && business.owner_notification_phone) {
        const localNow = localParts(now, timezone)
        const summaryHour = Number((business.owner_daily_summary_time || '20:00').slice(0, 2))
        businessDebug.summaryHour = summaryHour
        businessDebug.localHour = localNow.hour

        if (localNow.hour === summaryHour) {
          const range = tomorrowLocalRange(now, timezone)
          const { data: appointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('id, starts_at, status, clients(name), services(name), employees(name)')
            .eq('business_id', business.id)
            .gte('starts_at', range.start.toISOString())
            .lt('starts_at', range.end.toISOString())
            .in('status', ['pending', 'confirmed'])
            .order('starts_at')

          if (appointmentsError) {
            businessDebug.summaryError = appointmentsError.message
          } else if ((appointments ?? []).length > 0) {
            const notification = await createInternalNotification(supabase, {
              businessId: business.id,
              type: 'daily_summary',
              title: 'Agenda de amanhã',
              body: `${appointments!.length} atendimento${appointments!.length > 1 ? 's' : ''} agendado${appointments!.length > 1 ? 's' : ''}.`,
              href: '/booking',
              refId: range.key,
            })

            if (notification.created) {
              const lines = appointments!.slice(0, 20).map((appointment: any) => {
                const client = oneRelated<{ name: string }>(appointment.clients)
                const service = oneRelated<{ name: string }>(appointment.services)
                const employee = oneRelated<{ name: string }>(appointment.employees)
                const employeeText = employee?.name ? ` · ${employee.name}` : ''
                return `• ${formatTimePtBr(appointment.starts_at, timezone)} — ${client?.name ?? 'Cliente'} · ${service?.name ?? 'Serviço'}${employeeText}`
              })

              const message = [
                '🗓️ *Sua agenda de amanhã*',
                '',
                `${formatDatePtBr(range.start.toISOString(), timezone)}`,
                '',
                ...lines,
                '',
                `Total: ${appointments!.length} atendimento${appointments!.length > 1 ? 's' : ''}.`,
                '',
                `— ${business.name}`,
              ].join('\n')

              const ok = await sendWhatsAppMessage(
                business.owner_notification_phone,
                message,
                getBusinessWhatsAppCredentials(business)
              )
              if (ok) sent.push(`daily_summary:${business.id}:${range.key}`)
            }
          }
        }
      }

      if (business.notify_owner_next_appointment && business.owner_notification_phone) {
        const minutes = business.owner_next_appointment_minutes || 30
        // Como o cron roda a cada hora, usamos uma janela ampla e deduplicamos pelo agendamento.
        const from = new Date(now.getTime() + Math.max(0, minutes - 30) * 60_000)
        const to = new Date(now.getTime() + (minutes + 30) * 60_000)
        const { data: upcoming, error: upcomingError } = await supabase
          .from('appointments')
          .select('id, starts_at, clients(name, phone), services(name), employees(name)')
          .eq('business_id', business.id)
          .gte('starts_at', from.toISOString())
          .lt('starts_at', to.toISOString())
          .in('status', ['pending', 'confirmed'])
          .order('starts_at')

        if (upcomingError) {
          businessDebug.upcomingError = upcomingError.message
        } else {
          for (const appointment of upcoming ?? []) {
            const client = oneRelated<{ name: string; phone: string | null }>(appointment.clients)
            const service = oneRelated<{ name: string }>(appointment.services)
            const employee = oneRelated<{ name: string }>(appointment.employees)
            const time = formatTimePtBr(appointment.starts_at, timezone)

            const notification = await createInternalNotification(supabase, {
              businessId: business.id,
              type: 'next_appointment',
              title: 'Próximo atendimento',
              body: `${client?.name ?? 'Cliente'} · ${service?.name ?? 'Serviço'} às ${time}.`,
              href: '/booking',
              refId: appointment.id,
            })
            if (!notification.created) continue

            const message = [
              '⏰ *Próximo atendimento*',
              '',
              `*Horário:* ${time}`,
              `*Cliente:* ${client?.name ?? 'Cliente'}`,
              `*Serviço:* ${service?.name ?? 'Serviço'}`,
              employee?.name ? `*Profissional:* ${employee.name}` : '',
              client?.phone ? `*Telefone:* ${client.phone}` : '',
              '',
              'Abra o AtendePRO para ver os detalhes.',
            ].filter(Boolean).join('\n')

            const ok = await sendWhatsAppMessage(
              business.owner_notification_phone,
              message,
              getBusinessWhatsAppCredentials(business)
            )
            if (ok) sent.push(`next_appointment:${appointment.id}`)
          }
        }
      }
    } catch (error) {
      businessDebug.error = error instanceof Error ? error.message : 'unknown_error'
      console.error('[cron/business-alerts]', business.id, error)
    }

    ;(debug.businesses as unknown[]).push(businessDebug)
  }

  return NextResponse.json({ ok: true, sent: sent.length, results: sent, debug })
}
