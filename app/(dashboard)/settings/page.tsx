import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { SettingsTabs } from './settings-tabs'
import { EvolutionSettingsPortal } from '@/components/evolution-settings-portal'
import { OwnerNotificationSettingsPortal } from '@/components/owner-notification-settings-portal'
import { SettingsExperiencePolish } from '@/components/settings-experience-polish'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (businessError) {
    console.error('[settings] business query failed:', businessError.message)
  }
  if (!business) redirect('/onboarding')

  const runtimeBusiness = business as typeof business & {
    evolution_api_url?: string | null
    evolution_api_key?: string | null
    evolution_instance?: string | null
    evolution_enabled?: boolean | null
    evolution_template_confirmation?: string | null
    evolution_template_reminder_24h?: string | null
    evolution_template_reminder_1h?: string | null
    evolution_template_thankyou?: string | null
    evolution_template_reactivation?: string | null
    evolution_template_birthday?: string | null
    owner_notification_phone?: string | null
    notify_owner_new_booking?: boolean | null
    notify_owner_daily_summary?: boolean | null
    owner_daily_summary_time?: string | null
    notify_owner_next_appointment?: boolean | null
    owner_next_appointment_minutes?: number | null
  }

  const evolutionConfigured = Boolean(
    runtimeBusiness.evolution_enabled &&
    runtimeBusiness.evolution_api_url &&
    runtimeBusiness.evolution_api_key &&
    runtimeBusiness.evolution_instance
  )

  // A chave da Evolution permanece no servidor e não é enviada ao navegador.
  const safeBusiness = { ...runtimeBusiness }
  delete (safeBusiness as { evolution_api_key?: string | null }).evolution_api_key

  const [
    { data: services },
    { data: employees },
    { data: businessHours },
  ] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, price, duration_min, category, is_active, capacity')
      .eq('business_id', business.id)
      .order('name'),
    supabase
      .from('employees')
      .select('id, name, role, email, phone, is_active')
      .eq('business_id', business.id)
      .order('name'),
    supabase
      .from('business_hours')
      .select('day_of_week, is_open, open_time, close_time')
      .eq('business_id', business.id)
      .order('day_of_week'),
  ])

  const deploymentMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || 'selfhosted'

  return (
    <>
      <Header title="Configurações" />
      <SettingsExperiencePolish deploymentMode={deploymentMode} />
      <div id="atendepro-settings-shell">
      <SettingsTabs
        business={safeBusiness}
        services={services ?? []}
        employees={employees ?? []}
        workingHours={businessHours ?? []}
        userEmail={user.email ?? ''}
      />
      <EvolutionSettingsPortal
        initialApiUrl={runtimeBusiness.evolution_api_url ?? ''}
        initialInstance={runtimeBusiness.evolution_instance ?? ''}
        configured={evolutionConfigured}
        initialTemplates={{
          confirmation: runtimeBusiness.evolution_template_confirmation ?? '',
          reminder24h: runtimeBusiness.evolution_template_reminder_24h ?? '',
          reminder1h: runtimeBusiness.evolution_template_reminder_1h ?? '',
          thankyou: runtimeBusiness.evolution_template_thankyou ?? '',
          reactivation: runtimeBusiness.evolution_template_reactivation ?? '',
          birthday: runtimeBusiness.evolution_template_birthday ?? '',
        }}
      />
      <OwnerNotificationSettingsPortal
        initialPhone={runtimeBusiness.owner_notification_phone ?? ''}
        initialNotifyNewBooking={runtimeBusiness.notify_owner_new_booking !== false}
        initialNotifyDailySummary={runtimeBusiness.notify_owner_daily_summary !== false}
        initialDailySummaryTime={(runtimeBusiness.owner_daily_summary_time ?? '20:00').slice(0, 5)}
        initialNotifyNextAppointment={Boolean(runtimeBusiness.notify_owner_next_appointment)}
        initialNextAppointmentMinutes={runtimeBusiness.owner_next_appointment_minutes ?? 30}
      />
      </div>
    </>
  )
}
