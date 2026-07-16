import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyNewOnlineBooking } from '@/lib/business-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonError(error: string, message: string, status = 500) {
  return NextResponse.json({ error, message }, { status })
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[<>\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength)
}

function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length >= 12) digits = digits.slice(1)
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits
}

function parseDateTimeInTimezone(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)

  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    throw new Error('Data ou horário inválido.')
  }

  const referenceUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(referenceUtc)

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  const representedLocalTime = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  )
  const timezoneOffset = representedLocalTime - referenceUtc.getTime()

  return new Date(Date.UTC(year, month - 1, day, hour, minute) - timezoneOffset)
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonError('server_not_configured', 'As credenciais do Supabase não estão configuradas.')
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return jsonError('invalid_json', 'Os dados enviados são inválidos.', 400)
    }

    const businessId = cleanText(body.businessId, 50)
    const serviceId = cleanText(body.serviceId, 50)
    const employeeId = cleanText(body.employeeId, 50) || null
    const date = cleanText(body.date, 10)
    const time = cleanText(body.time, 5)
    const name = cleanText(body.name, 100)
    const rawPhone = cleanText(body.phone, 30)
    const email = cleanText(body.email, 200).toLowerCase() || null

    if (!/^[0-9a-f-]{36}$/i.test(businessId) || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
      return jsonError('invalid_identifiers', 'Negócio ou serviço inválido.', 422)
    }
    if (employeeId && !/^[0-9a-f-]{36}$/i.test(employeeId)) {
      return jsonError('invalid_employee', 'Profissional inválido.', 422)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return jsonError('invalid_datetime', 'Data ou horário inválido.', 422)
    }
    if (!name) return jsonError('invalid_name', 'Informe seu nome.', 422)
    if (!rawPhone && !email) {
      return jsonError('contact_required', 'Informe telefone ou e-mail.', 422)
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return jsonError('invalid_email', 'Informe um e-mail válido.', 422)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
    })

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
      return jsonError('service_lookup_failed', serviceResult.error.message)
    }
    if (businessResult.error) {
      return jsonError('business_lookup_failed', businessResult.error.message)
    }
    if (!serviceResult.data || !businessResult.data) {
      return jsonError('service_or_business_not_found', 'Serviço ou negócio não encontrado.', 404)
    }

    let existingClient: {
      id: string
      name: string
      phone: string | null
      email: string | null
      telegram_id: string | null
    } | null = null

    if (rawPhone) {
      const phoneResult = await supabase
        .from('clients')
        .select('id, name, phone, email, telegram_id')
        .eq('business_id', businessId)
        .eq('phone', rawPhone)
        .limit(1)
        .maybeSingle()

      if (phoneResult.error) {
        return jsonError('client_lookup_failed', phoneResult.error.message)
      }
      existingClient = phoneResult.data
    }

    if (!existingClient && email) {
      const emailResult = await supabase
        .from('clients')
        .select('id, name, phone, email, telegram_id')
        .eq('business_id', businessId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle()

      if (emailResult.error) {
        return jsonError('client_lookup_failed', emailResult.error.message)
      }
      existingClient = emailResult.data
    }

    let clientId: string
    let hasTelegram = false

    if (existingClient) {
      clientId = existingClient.id
      hasTelegram = Boolean(existingClient.telegram_id)

      const updateResult = await supabase
        .from('clients')
        .update({
          name,
          phone: rawPhone || existingClient.phone,
          email: email || existingClient.email,
        })
        .eq('id', existingClient.id)
        .eq('business_id', businessId)

      if (updateResult.error) {
        return jsonError('client_update_failed', updateResult.error.message)
      }
    } else {
      const insertResult = await supabase
        .from('clients')
        .insert({ business_id: businessId, name, phone: rawPhone || null, email })
        .select('id')
        .single()

      if (insertResult.error || !insertResult.data) {
        return jsonError(
          'client_creation_failed',
          insertResult.error?.message || 'Não foi possível cadastrar o cliente.',
          insertResult.error?.code === '23505' ? 409 : 500
        )
      }
      clientId = insertResult.data.id
    }

    const timezone = businessResult.data.timezone || 'America/Sao_Paulo'
    let startsAt: Date
    try {
      startsAt = parseDateTimeInTimezone(date, time, timezone)
    } catch (error) {
      return jsonError(
        'invalid_business_timezone',
        error instanceof Error ? error.message : `Fuso horário inválido: ${timezone}`
      )
    }

    const durationMinutes = Number(serviceResult.data.duration_min || 60)
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)

    const appointmentResult = await supabase
      .from('appointments')
      .insert({
        business_id: businessId,
        client_id: clientId,
        employee_id: employeeId,
        service_id: serviceId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        price: serviceResult.data.price,
        status: 'confirmed',
        source: 'online',
      })
      .select('id')
      .single()

    if (appointmentResult.error || !appointmentResult.data) {
      const isSlotTaken = appointmentResult.error?.message?.includes('slot_already_booked')
      return jsonError(
        isSlotTaken ? 'slot_taken' : 'booking_failed',
        isSlotTaken
          ? 'Este horário acabou de ser ocupado. Escolha outro horário.'
          : appointmentResult.error?.message || 'Não foi possível criar o agendamento.',
        isSlotTaken ? 409 : 500
      )
    }

    let employeeName: string | null = null
    if (employeeId) {
      const { data: employee } = await supabase
        .from('employees')
        .select('name')
        .eq('id', employeeId)
        .eq('business_id', businessId)
        .maybeSingle()
      employeeName = employee?.name ?? null
    }

    // Notificações são secundárias: uma falha nunca invalida o agendamento.
    await Promise.allSettled([
      (async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 7000)
        try {
          await fetch(`${request.nextUrl.origin}/api/email/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.INTERNAL_API_SECRET || ''}`,
            },
            body: JSON.stringify({ appointmentId: appointmentResult.data.id, formEmail: email }),
            cache: 'no-store',
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeout)
        }
      })(),
      notifyNewOnlineBooking({
        supabase,
        businessId,
        appointmentId: appointmentResult.data.id,
        clientName: name,
        clientPhone: rawPhone || null,
        serviceName: serviceResult.data.name,
        startsAt: startsAt.toISOString(),
        employeeName,
      }),
    ])

    return NextResponse.json({
      ok: true,
      appointmentId: appointmentResult.data.id,
      clientId,
      hasTelegram,
      whatsappNumber: rawPhone ? normalizePhone(rawPhone) : null,
    })
  } catch (error) {
    console.error('[public-booking] unhandled:', error)
    return jsonError(
      'internal_booking_error',
      error instanceof Error ? error.message : 'Erro interno ao criar o agendamento.'
    )
  }
}
