/**
 * POST /api/book
 * Public booking endpoint with server-side validation and service-role writes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit, getIp } from '@/lib/rate-limit'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

/** Convert a wall-clock date+time in an IANA timezone to UTC. */
function parseDateTimeInTz(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(noonUtc)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0')
  const localNoonMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  )
  const offsetMs = localNoonMs - noonUtc.getTime()
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offsetMs)
}

const BookingSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  name: z.string().min(1).max(100),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
})

function errorResponse(error: string, status = 500, message?: string) {
  return NextResponse.json({ error, ...(message ? { message } : {}) }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req)
    if (!rateLimit(ip, { limit: 20, windowMs: 10 * 60 * 1000 })) {
      return errorResponse('rate_limited', 429)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errorResponse('invalid_json', 400)
    }

    const parsed = BookingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
        { status: 422 }
      )
    }

    const { businessId, serviceId, employeeId, date, time } = parsed.data
    const name = sanitize(parsed.data.name)
    const email = parsed.data.email?.trim().toLowerCase() || null
    const rawPhone = parsed.data.phone?.trim() || null

    if (!name) return errorResponse('invalid_name', 422)
    if (!rawPhone && !email) {
      return errorResponse('contact_required', 400, 'Informe telefone ou e-mail.')
    }

    const supabase = createServiceClient()

    const [serviceResult, businessResult] = await Promise.all([
      supabase
        .from('services')
        .select('id, name, duration_min, price')
        .eq('id', serviceId)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('businesses')
        .select('id, name, timezone')
        .eq('id', businessId)
        .maybeSingle(),
    ])

    if (serviceResult.error) {
      console.error('[api/book] service lookup:', serviceResult.error.message)
      return errorResponse('service_lookup_failed', 500, serviceResult.error.message)
    }
    if (businessResult.error) {
      console.error('[api/book] business lookup:', businessResult.error.message)
      return errorResponse('business_lookup_failed', 500, businessResult.error.message)
    }
    if (!serviceResult.data || !businessResult.data) {
      return errorResponse('service_or_business_not_found', 404)
    }

    const service = serviceResult.data
    const business = businessResult.data

    // Only columns guaranteed by the initial AtendePRO schema are used here.
    let existing: {
      id: string
      name: string
      email: string | null
      phone: string | null
      telegram_id: string | null
    } | null = null

    if (rawPhone) {
      const phoneLookup = await supabase
        .from('clients')
        .select('id, name, email, phone, telegram_id')
        .eq('business_id', businessId)
        .eq('phone', rawPhone)
        .maybeSingle()

      if (phoneLookup.error) {
        console.error('[api/book] phone lookup:', phoneLookup.error.message)
        return errorResponse('client_lookup_failed', 500, phoneLookup.error.message)
      }
      existing = phoneLookup.data
    }

    if (!existing && email) {
      const emailLookup = await supabase
        .from('clients')
        .select('id, name, email, phone, telegram_id')
        .eq('business_id', businessId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle()

      if (emailLookup.error) {
        console.error('[api/book] email lookup:', emailLookup.error.message)
        return errorResponse('client_lookup_failed', 500, emailLookup.error.message)
      }
      existing = emailLookup.data
    }

    let clientId: string
    let hasTelegram = false

    if (existing) {
      clientId = existing.id
      hasTelegram = Boolean(existing.telegram_id)

      const { error: clientUpdateError } = await supabase
        .from('clients')
        .update({
          name,
          email: email ?? existing.email,
          phone: rawPhone ?? existing.phone,
        })
        .eq('id', existing.id)
        .eq('business_id', businessId)

      if (clientUpdateError) {
        console.error('[api/book] client update:', clientUpdateError.message)
        return errorResponse('client_update_failed', 500, clientUpdateError.message)
      }
    } else {
      const { data: newClient, error: insertError } = await supabase
        .from('clients')
        .insert({
          business_id: businessId,
          name,
          phone: rawPhone,
          email,
        })
        .select('id')
        .single()

      if (insertError || !newClient) {
        console.error('[api/book] client insert:', insertError?.code, insertError?.message)
        return errorResponse(
          'client_creation_failed',
          insertError?.code === '23505' ? 409 : 500,
          insertError?.message || 'Não foi possível cadastrar o cliente.'
        )
      }
      clientId = newClient.id
    }

    const timezone = business.timezone || 'America/Sao_Paulo'
    let startsAt: Date
    try {
      startsAt = parseDateTimeInTz(date, time, timezone)
    } catch (error) {
      console.error('[api/book] invalid timezone:', timezone, error)
      return errorResponse('invalid_business_timezone', 500, `Fuso horário inválido: ${timezone}`)
    }
    const endsAt = new Date(startsAt.getTime() + Number(service.duration_min || 60) * 60_000)

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        business_id: businessId,
        client_id: clientId,
        employee_id: employeeId ?? null,
        service_id: serviceId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        price: service.price,
        status: 'confirmed',
        source: 'online',
      })
      .select('id')
      .single()

    if (appointmentError || !appointment) {
      if (appointmentError?.message?.includes('slot_already_booked')) {
        return errorResponse('slot_taken', 409, 'Este horário acabou de ser ocupado.')
      }
      console.error('[api/book] appointment insert:', appointmentError?.code, appointmentError?.message)
      return errorResponse('booking_failed', 500, appointmentError?.message || 'Não foi possível criar o agendamento.')
    }

    // A notification failure never rolls back a successfully created booking.
    try {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
      await fetch(`${appUrl}/api/email/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INTERNAL_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({ appointmentId: appointment.id, formEmail: email }),
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      })
    } catch (notificationError) {
      console.error('[api/book] notification delivery:', notificationError)
    }

    return NextResponse.json({
      appointmentId: appointment.id,
      clientId,
      hasTelegram,
      hasViber: false,
    })
  } catch (error) {
    console.error('[api/book] unhandled:', error)
    return errorResponse(
      'internal_booking_error',
      500,
      error instanceof Error ? error.message : 'Erro interno ao criar o agendamento.'
    )
  }
}
