'use server'

import { createClient } from '@/lib/supabase/server'

function sanitize(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
}

type CompleteOnboardingResult = {
  redirectTo: string
}

export async function completeOnboarding(data: {
  bizType: string
  bizName?: string
  serviceName: string
  servicePrice: number
  serviceDuration: number
  slug?: string
}): Promise<CompleteOnboardingResult> {
  const supabase = createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Sua sessão expirou. Entre novamente para continuar.')
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, slug')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (businessError || !business) {
    throw new Error('Não foi possível localizar o negócio desta conta.')
  }

  const bizName = data.bizName ? sanitize(data.bizName).slice(0, 100) : undefined
  const serviceName = sanitize(data.serviceName ?? '').slice(0, 100)

  const finalSlug = data.slug ?? business.slug
  if (data.slug && !/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(data.slug)) {
    throw new Error('O endereço escolhido para o negócio é inválido.')
  }

  // O primeiro serviço é opcional. A tela permite pular essa etapa.
  if (serviceName) {
    if (!Number.isFinite(data.servicePrice) || data.servicePrice < 0) {
      throw new Error('Informe um preço válido para o serviço.')
    }

    const duration = Number.isFinite(data.serviceDuration) && data.serviceDuration > 0
      ? Math.round(data.serviceDuration)
      : 60

    const { error: serviceError } = await supabase.from('services').insert({
      business_id: business.id,
      name: serviceName,
      price: data.servicePrice,
      duration_min: duration,
    })

    if (serviceError) {
      throw new Error('Não foi possível cadastrar o primeiro serviço.')
    }
  }

  const { error: updateError } = await supabase
    .from('businesses')
    .update({
      ...(data.bizType ? { type: data.bizType } : {}),
      ...(bizName ? { name: bizName } : {}),
      ...(data.slug ? { slug: data.slug } : {}),
      onboarding_completed: true,
    })
    .eq('id', business.id)

  if (updateError) {
    throw new Error('Não foi possível concluir a configuração do negócio.')
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'saas' && rootDomain && finalSlug) {
    return { redirectTo: `https://${finalSlug}.${rootDomain}/dashboard` }
  }

  return { redirectTo: '/dashboard' }
}
