import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { SettingsTabs } from './settings-tabs'
import { EvolutionSettingsPortal } from '@/components/evolution-settings-portal'

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

  return (
    <>
      <Header title="Configurações" />
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
      />
    </>
  )
}
