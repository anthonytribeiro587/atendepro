import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendBookingConfirmation, formatEmailDate, formatEmailTime } from '@/lib/email'
import { buildGCalUrlFromISO } from '@/lib/gcal'
import { sendTelegramMessage, tplNewBooking } from '@/lib/telegram'
import { sendViberMessage, tplNewBooking as viberTplNewBooking } from '@/lib/viber'
import { sendWhatsAppMessage, tplBookingConfirmation as waTplBookingConfirmation } from '@/lib/whatsapp'

function tplConfirmClient(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  businessName: string
  address?: string
}): string {
  const lines = [
    `✅ Agendamento confirmado!`,
    ``,
    `👤 ${opts.clientName}`,
    `📋 ${opts.serviceName}`,
    `🕐 ${opts.date} às ${opts.time}`,
    `🏠 ${opts.businessName}`,
  ]
  if (opts.address) lines.push(`📍 ${opts.address}`)
  lines.push(``, `Enviaremos um lembrete antes do atendimento.`)
  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const expectedSecret = process.env.INTERNAL_API_SECRET

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { appointmentId, formEmail } = await req.json()
    if (!appointmentId) {
      return NextResponse.json({ error: 'missing_appointment_id' }, { status: 400 })
    }

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('id, starts_at, business_id, source, services(name, duration_min), employees(name), clients(name, email, phone, whatsapp_number, telegram_id, viber_user_id)')
      .eq('id', appointmentId)
      .single()

    if (appointmentError || !appointment) {
      console.error('[notifications/booking] appointment:', appointmentError?.message)
      return NextResponse.json({ error: 'appointment_not_found' }, { status: 404 })
    }

    const client = appointment.clients as unknown as {
      name: string
      email: string | null
      phone: string | null
      whatsapp_number: string | null
      telegram_id: string | null
      viber_user_id: string | null
    } | null
    const service = appointment.services as unknown as { name: string; duration_min: number } | null
    const employee = appointment.employees as unknown as { name: string } | null

    // Keep this select limited to columns that exist in the initial AtendePRO schema.
    // WhatsApp Evolution credentials are stored securely in Vercel environment variables.
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('name, address, slug, timezone, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id')
      .eq('id', appointment.business_id)
      .single()

    if (businessError || !business) {
      console.error('[notifications/booking] business:', businessError?.message)
      return NextResponse.json({ error: 'business_not_found' }, { status: 404 })
    }

    const timezone = business.timezone || 'America/Sao_Paulo'
    const date = formatEmailDate(appointment.starts_at, timezone)
    const time = formatEmailTime(appointment.starts_at, timezone)
    const results: Record<string, boolean | string> = {}

    if (business.telegram_bot_token && business.telegram_chat_id) {
      results.telegramOwner = await sendTelegramMessage(
        business.telegram_bot_token,
        business.telegram_chat_id,
        tplNewBooking({
          clientName: client?.name ?? 'Cliente',
          serviceName: service?.name ?? 'Serviço',
          date,
          time,
          employeeName: employee?.name,
          source: appointment.source ?? undefined,
        })
      )
    }

    if (business.telegram_bot_token && client?.telegram_id) {
      results.telegramClient = await sendTelegramMessage(
        business.telegram_bot_token,
        client.telegram_id,
        tplConfirmClient({
          clientName: client.name,
          serviceName: service?.name ?? 'Serviço',
          date,
          time,
          businessName: business.name,
          address: business.address ?? undefined,
        })
      )
    }

    if (business.viber_bot_token && business.viber_chat_id) {
      results.viberOwner = await sendViberMessage(
        business.viber_bot_token,
        business.viber_chat_id,
        viberTplNewBooking({
          clientName: client?.name ?? 'Cliente',
          serviceName: service?.name ?? 'Serviço',
          date,
          time,
          employeeName: employee?.name,
          source: appointment.source ?? undefined,
        })
      )
    }

    if (business.viber_bot_token && client?.viber_user_id) {
      results.viberClient = await sendViberMessage(
        business.viber_bot_token,
        client.viber_user_id,
        tplConfirmClient({
          clientName: client.name,
          serviceName: service?.name ?? 'Serviço',
          date,
          time,
          businessName: business.name,
          address: business.address ?? undefined,
        })
      )
    }

    const whatsapp = client?.whatsapp_number || client?.phone
    if (whatsapp) {
      results.whatsapp = await sendWhatsAppMessage(
        whatsapp,
        waTplBookingConfirmation({
          clientName: client?.name ?? 'Cliente',
          serviceName: service?.name ?? 'Serviço',
          date,
          time,
          businessName: business.name,
          employeeName: employee?.name,
          address: business.address ?? undefined,
        })
      )
    }

    const recipientEmail = formEmail || client?.email
    if (recipientEmail) {
      const { data: alreadySent } = await supabase
        .from('notification_log')
        .select('id')
        .eq('business_id', appointment.business_id)
        .eq('ref_id', appointment.id)
        .eq('type', 'confirm')
        .eq('channel', 'email')
        .maybeSingle()

      if (!alreadySent) {
        const calendarUrl = buildGCalUrlFromISO({
          businessName: business.name,
          serviceName: service?.name ?? '',
          employeeName: employee?.name ?? null,
          startsAt: appointment.starts_at,
          durationMin: service?.duration_min ?? 60,
          timezone,
          address: business.address ?? null,
        })

        try {
          await sendBookingConfirmation({
            to: recipientEmail,
            clientName: client?.name ?? 'Cliente',
            businessName: business.name,
            serviceName: service?.name ?? 'Serviço',
            date,
            time,
            employeeName: employee?.name ?? undefined,
            address: business.address ?? undefined,
            calendarUrl,
          })
          results.email = true

          const { error: logError } = await supabase.from('notification_log').insert({
            business_id: appointment.business_id,
            ref_id: appointment.id,
            type: 'confirm',
            channel: 'email',
          })
          if (logError && logError.code !== '23505') {
            console.error('[notifications/booking] email log:', logError.message)
          }
        } catch (emailError) {
          console.error('[notifications/booking] email:', emailError)
          results.email = false
        }
      } else {
        results.email = 'already_sent'
      }
    } else {
      results.email = 'no_recipient'
    }

    return NextResponse.json({ sent: true, results })
  } catch (error) {
    console.error('[notifications/booking] unhandled:', error)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
