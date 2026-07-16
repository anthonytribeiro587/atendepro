export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { PublicBookingFormV2 } from './booking-form-v2'
import { getTelegramBotInfo } from '@/lib/telegram'
import { getViberBotInfo } from '@/lib/viber'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('businesses')
    .select('name')
    .eq('slug', params.slug)
    .maybeSingle()

  return {
    title: data ? `Agendar em ${data.name}` : 'Agendar horário',
  }
}

export default async function PublicBookingPage({ params }: { params: { slug: string } }) {
  const supabase = createServiceClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, type, phone, logo_url, currency, slug, timezone, address, brand_color')
    .eq('slug', params.slug)
    .maybeSingle()

  if (!business) notFound()

  const { data: bizTokens } = await supabase
    .from('businesses')
    .select('telegram_bot_token, viber_bot_token')
    .eq('id', business.id)
    .maybeSingle()

  const [
    { data: services },
    { data: employees },
    { data: businessHours },
    telegramInfo,
    viberInfo,
  ] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, price, duration_min, category, capacity')
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
      .from('business_hours')
      .select('day_of_week, is_open, open_time, close_time')
      .eq('business_id', business.id)
      .order('day_of_week'),
    bizTokens?.telegram_bot_token
      ? getTelegramBotInfo(bizTokens.telegram_bot_token)
      : Promise.resolve({ ok: false as const }),
    bizTokens?.viber_bot_token
      ? getViberBotInfo(bizTokens.viber_bot_token)
      : Promise.resolve({ ok: false as const }),
  ])

  const telegramBotUsername = telegramInfo.ok
    ? (telegramInfo as { ok: true; result: { username: string } }).result?.username ?? null
    : null
  const viberBotUri = viberInfo.ok
    ? (viberInfo as { ok: true; uri?: string }).uri ?? null
    : null

  const brandColor = business.brand_color || '#2D2926'

  return (
    <div
      style={{
        '--brand': brandColor,
        '--brand-light': `${brandColor}18`,
      } as React.CSSProperties}
    >
      <header style={{ background: 'white', borderBottom: '0.5px solid #E8E0D8', padding: '14px 16px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.name} style={{ width: 42, height: 42, borderRadius: 11, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: 17 }}>
              {business.name[0]}
            </div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#2D2926' }}>{business.name}</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Agendamento online</div>
          </div>
        </div>
      </header>

      <main style={{ background: '#FBF8F5', minHeight: 'calc(100vh - 71px)', padding: '24px 16px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <PublicBookingFormV2
            business={business}
            services={services ?? []}
            employees={employees ?? []}
            workingHours={businessHours ?? []}
            telegramBotUsername={telegramBotUsername}
            viberBotUri={viberBotUri}
          />
        </div>
      </main>
    </div>
  )
}
