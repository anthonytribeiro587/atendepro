import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { POSTerminal } from './pos-terminal'
import { FinishAppointmentTerminal } from './finish-appointment-terminal'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { History } from 'lucide-react'
import { formatInBusinessTimezone } from '@/lib/utils'

interface SearchParams {
  bookingId?: string
  clientId?: string
  serviceId?: string
  staffId?: string
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function POSPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency, timezone')
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) return null

  const [{ data: services }, { data: employees }, { data: clients }] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, price, duration_min, category')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('employees')
      .select('id, name')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('clients')
      .select('id, name, phone')
      .eq('business_id', business.id)
      .order('name')
      .limit(200),
  ])

  let bookingContext: {
    bookingId: string
    clientId: string
    serviceId: string
    staffId: string
    label: string
  } | undefined

  if (searchParams.bookingId) {
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, starts_at, client_id, service_id, employee_id, clients(name), services(name), employees(id, name)')
      .eq('id', searchParams.bookingId)
      .eq('business_id', business.id)
      .maybeSingle()

    if (appt) {
      const client = firstRelation(appt.clients as { name: string } | { name: string }[] | null)
      const service = firstRelation(appt.services as { name: string } | { name: string }[] | null)
      const employee = firstRelation(appt.employees as { id: string; name: string } | { id: string; name: string }[] | null)
      const tz = business.timezone ?? 'America/Sao_Paulo'

      bookingContext = {
        bookingId: appt.id,
        clientId: searchParams.clientId ?? appt.client_id ?? '',
        serviceId: searchParams.serviceId ?? appt.service_id ?? '',
        staffId: searchParams.staffId ?? appt.employee_id ?? employee?.id ?? '',
        label: `${client?.name ?? 'Cliente'} — ${service?.name ?? 'Atendimento'} — ${formatInBusinessTimezone(appt.starts_at, tz, 'time')}`,
      }
    }
  }

  const t = await getTranslations('pos')

  if (bookingContext) {
    return (
      <>
        <Header title="Finalizar atendimento" />
        <FinishAppointmentTerminal
          businessId={business.id}
          currency={business.currency}
          services={services ?? []}
          employees={employees ?? []}
          clients={clients ?? []}
          bookingContext={bookingContext}
        />
      </>
    )
  }

  return (
    <>
      <Header
        title={t('title')}
        actions={
          <Link href="/pos/history" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700">
            <History className="h-4 w-4" /> Histórico de vendas
          </Link>
        }
      />
      <POSTerminal
        businessId={business.id}
        currency={business.currency}
        services={services ?? []}
        employees={employees ?? []}
        clients={clients ?? []}
      />
    </>
  )
}
