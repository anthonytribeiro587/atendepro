import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendThankYou } from '@/lib/email'
import {
  DEFAULT_EVOLUTION_TEMPLATES,
  renderWhatsAppTemplate,
  sendWhatsAppMessage,
  type WhatsAppCredentials,
} from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ItemSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().min(1).max(160),
  price: z.number().nonnegative(),
  qty: z.number().int().positive().max(50),
})

const FinalizeSchema = z.object({
  paid: z.boolean(),
  paymentMethod: z.enum(['cash', 'card', 'transfer']),
  amount: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  clientId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  items: z.array(ItemSchema).min(1).max(50),
})

function jsonError(error: string, message: string, status = 400) {
  return NextResponse.json({ error, message }, { status })
}

function credentialsFromBusiness(business: {
  evolution_enabled: boolean | null
  evolution_api_url: string | null
  evolution_api_key: string | null
  evolution_instance: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
}): WhatsAppCredentials {
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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return jsonError('unauthorized', 'Faça login novamente.', 401)

    const parsed = FinalizeSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonError('server_not_configured', 'As credenciais do Supabase não estão configuradas.', 500)
    }

    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: appointment, error: appointmentError } = await admin
      .from('appointments')
      .select('id, business_id, client_id, employee_id, service_id, status')
      .eq('id', params.id)
      .maybeSingle()

    if (appointmentError) return jsonError('appointment_lookup_failed', appointmentError.message, 500)
    if (!appointment) return jsonError('appointment_not_found', 'Agendamento não encontrado.', 404)

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .select(`
        id, owner_id, name, slug, address, timezone,
        evolution_enabled, evolution_api_url, evolution_api_key, evolution_instance,
        evolution_template_thankyou,
        meta_whatsapp_phone_number_id, meta_whatsapp_access_token
      `)
      .eq('id', appointment.business_id)
      .maybeSingle()

    if (businessError) return jsonError('business_lookup_failed', businessError.message, 500)
    if (!business || business.owner_id !== user.id) return jsonError('forbidden', 'Você não pode alterar este atendimento.', 403)

    if (['cancelled', 'no_show'].includes(appointment.status)) {
      return jsonError('invalid_status', 'Um agendamento cancelado ou marcado como falta não pode ser finalizado.', 409)
    }

    if (['completed', 'paid'].includes(appointment.status)) {
      return NextResponse.json({
        ok: true,
        alreadyCompleted: true,
        message: 'Este atendimento já estava concluído.',
        receiptNumber: null,
        notification: { whatsapp: false, email: false },
      })
    }

    const body = parsed.data
    const clientId = body.clientId ?? appointment.client_id ?? null
    const employeeId = body.employeeId ?? appointment.employee_id ?? null
    let receiptNumber: string | null = null

    if (body.paid) {
      const { data: transaction, error: transactionError } = await admin
        .from('transactions')
        .insert({
          business_id: appointment.business_id,
          client_id: clientId,
          employee_id: employeeId,
          amount: body.amount,
          payment_method: body.paymentMethod,
          status: 'completed',
          items: body.items.map((item: { serviceId: string; name: string; price: number; qty: number }) => ({
            service_id: item.serviceId,
            name: item.name,
            price: item.price,
            qty: item.qty,
            discount: body.discount,
            appointment_id: appointment.id,
          })),
        })
        .select('receipt_number')
        .single()

      if (transactionError) return jsonError('payment_failed', transactionError.message, 500)
      receiptNumber = transaction?.receipt_number ?? null
    }

    const { error: updateError } = await admin
      .from('appointments')
      .update({
        status: 'completed',
        client_id: clientId,
        employee_id: employeeId,
      })
      .eq('id', appointment.id)
      .eq('business_id', appointment.business_id)

    if (updateError) return jsonError('appointment_update_failed', updateError.message, 500)

    if (clientId) {
      const { error: visitError } = await admin
        .from('clients')
        .update({ last_visit_at: new Date().toISOString() })
        .eq('id', clientId)
        .eq('business_id', appointment.business_id)

      if (visitError) console.error('[finalize] last_visit_at:', visitError.message)
    }

    let whatsappSent = false
    let emailSent = false

    if (clientId) {
      const [{ data: client }, { data: service }] = await Promise.all([
        admin
          .from('clients')
          .select('name, phone, email')
          .eq('id', clientId)
          .eq('business_id', appointment.business_id)
          .maybeSingle(),
        admin
          .from('services')
          .select('name')
          .eq('id', body.items[0].serviceId)
          .eq('business_id', appointment.business_id)
          .maybeSingle(),
      ])

      if (client) {
        const bookingUrl = business.slug
          ? `${(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/+$/, '')}/book/${business.slug}`
          : undefined
        const serviceName = service?.name ?? body.items[0]?.name ?? 'Atendimento'

        if (client.phone) {
          const message = renderWhatsAppTemplate(
            business.evolution_template_thankyou,
            {
              cliente: client.name,
              servico: serviceName,
              empresa: business.name,
              link_agendamento: bookingUrl,
            },
            DEFAULT_EVOLUTION_TEMPLATES.thankyou
          )

          whatsappSent = await sendWhatsAppMessage(
            client.phone,
            message,
            credentialsFromBusiness(business)
          )
        }

        if (client.email) {
          try {
            await sendThankYou({
              to: client.email,
              clientName: client.name,
              businessName: business.name,
              serviceName,
              bookingUrl,
            })
            emailSent = true
          } catch (emailError) {
            console.error('[finalize] thank-you email:', emailError)
          }
        }
      }
    }

    if (whatsappSent || emailSent) {
      const { error: logError } = await admin.from('notification_log').insert({
        business_id: appointment.business_id,
        ref_id: appointment.id,
        type: 'thankyou',
        channel: 'automation',
      })
      if (logError && logError.code !== '23505') {
        console.error('[finalize] notification log:', logError.message)
      }
    }

    return NextResponse.json({
      ok: true,
      receiptNumber,
      notification: {
        whatsapp: whatsappSent,
        email: emailSent,
      },
    })
  } catch (error) {
    console.error('[finalize] unhandled:', error)
    return jsonError(
      'internal_error',
      error instanceof Error ? error.message : 'Erro interno ao finalizar o atendimento.',
      500
    )
  }
}
