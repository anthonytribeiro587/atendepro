import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { getTranslations } from 'next-intl/server'
import { SettingsTabs } from './settings-tabs'
import { EvolutionTestCard } from '@/components/evolution-test-card'

export default async function SettingsPage() {
  const supabase = createClient()
  const t = await getTranslations('settings')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // select('*') keeps this page compatible while optional notification and
  // white-label columns are introduced incrementally in the database.
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

  const evolutionInstance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || null
  const evolutionEnabled = Boolean(
    process.env.EVOLUTION_API_URL &&
    process.env.EVOLUTION_API_KEY &&
    evolutionInstance
  )

  return (
    <>
      <Header title={t('pageTitle')} />
      <EvolutionTestCard enabled={evolutionEnabled} instance={evolutionInstance} />
      <SettingsTabs
        business={business}
        services={services ?? []}
        employees={employees ?? []}
        workingHours={businessHours ?? []}
        userEmail={user.email ?? ''}
      />
    </>
  )
}
