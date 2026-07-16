'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface Props {
  businessId: string
  enabledModules: string[]
}

interface Steps {
  profileCreated: boolean
  modulesConfigured: boolean
  hasService: boolean
  hasClient: boolean
  hasBooking: boolean
  hasNotification: boolean
}

interface RetailSteps {
  profileCreated: boolean
  hasProduct: boolean
}

function notificationsReady(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const business = value as Record<string, unknown>

  const evolution = Boolean(
    business.evolution_enabled &&
    business.evolution_api_url &&
    business.evolution_instance
  )
  const meta = Boolean(
    business.meta_whatsapp_phone_number_id &&
    business.meta_whatsapp_access_token
  )
  const email = Boolean(
    business.resend_api_key ||
    (business.smtp_host && business.smtp_user)
  )
  const chatBot = Boolean(
    business.telegram_bot_token ||
    business.viber_bot_token
  )

  return evolution || meta || email || chatBot
}

export function OnboardingChecklist({ businessId, enabledModules }: Props) {
  const t = useTranslations('onboarding.checklist')
  const isRetail = !enabledModules.includes('bookings')
  const dismissedKey = `atendepro_onboarding_dismissed_${businessId}`
  const completeKey = `atendepro_onboarding_complete_${businessId}`

  const [visible, setVisible] = useState(false)
  const [steps, setSteps] = useState<Steps>({
    profileCreated: true,
    modulesConfigured: true,
    hasService: false,
    hasClient: false,
    hasBooking: false,
    hasNotification: false,
  })
  const [retailSteps, setRetailSteps] = useState<RetailSteps>({
    profileCreated: true,
    hasProduct: false,
  })

  useEffect(() => {
    if (
      localStorage.getItem(dismissedKey) === 'true' ||
      localStorage.getItem(completeKey) === 'true'
    ) {
      return
    }

    const supabase = createClient()

    if (isRetail) {
      supabase
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .then(({ count }) => {
          const next: RetailSteps = {
            profileCreated: true,
            hasProduct: (count ?? 0) > 0,
          }
          setRetailSteps(next)

          if (Object.values(next).every(Boolean)) {
            localStorage.setItem(completeKey, 'true')
            setVisible(false)
          } else {
            setVisible(true)
          }
        })
      return
    }

    Promise.all([
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('businesses').select('*').eq('id', businessId).maybeSingle(),
    ]).then(([serviceResult, clientResult, appointmentResult, businessResult]) => {
      const next: Steps = {
        profileCreated: true,
        modulesConfigured: true,
        hasService: (serviceResult.count ?? 0) > 0,
        hasClient: (clientResult.count ?? 0) > 0,
        hasBooking: (appointmentResult.count ?? 0) > 0,
        hasNotification: notificationsReady(businessResult.data),
      }
      setSteps(next)

      if (Object.values(next).every(Boolean)) {
        localStorage.setItem(completeKey, 'true')
        setVisible(false)
      } else {
        setVisible(true)
      }
    })
  }, [businessId, completeKey, dismissedKey, isRetail])

  function dismiss() {
    localStorage.setItem(dismissedKey, 'true')
    setVisible(false)
  }

  if (!visible) return null

  type ChecklistItem = {
    key: string
    label: string
    done: boolean
    description: string | null
    action: { label: string; href: string } | null
  }

  const items: ChecklistItem[] = isRetail
    ? [
        { key: 'profile', label: t('step1'), done: retailSteps.profileCreated, description: null, action: null },
        { key: 'product', label: t('stepProduct'), done: retailSteps.hasProduct, description: null, action: { label: t('addProduct'), href: '/inventory/new' } },
      ]
    : [
        { key: 'profile', label: t('step1'), done: steps.profileCreated, description: null, action: null },
        { key: 'modules', label: t('stepModules'), done: steps.modulesConfigured, description: null, action: { label: t('configure'), href: '/settings?tab=modules' } },
        { key: 'service', label: t('step2'), done: steps.hasService, description: null, action: { label: t('addService'), href: '/settings?tab=services' } },
        { key: 'client', label: t('step3'), done: steps.hasClient, description: null, action: { label: t('addClient'), href: '/crm/new' } },
        { key: 'booking', label: t('step4'), done: steps.hasBooking, description: null, action: { label: t('openCalendar'), href: '/booking' } },
        { key: 'notifications', label: t('step5'), done: steps.hasNotification, description: t('step5sub'), action: { label: t('connect'), href: '/settings?tab=notifications' } },
      ]

  const completeCount = items.filter((item) => item.done).length

  return (
    <div className="relative rounded-xl border border-gray-200 bg-white p-5">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-4 top-3 text-xl leading-none text-gray-400 hover:text-gray-600"
        aria-label="Fechar guia inicial"
      >
        ×
      </button>

      <h3 className="pr-8 text-base font-semibold text-gray-900">{t('title')}</h3>
      <p className="mt-0.5 text-sm text-gray-500">{t('progress', { done: completeCount, total: items.length })}</p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(completeCount / items.length) * 100}%`, background: '#18a999' }}
        />
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-3">
            {item.done ? (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100">
                <svg className="h-3 w-3 text-green-600" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-gray-300" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className={`text-sm text-gray-900 ${item.done ? 'opacity-50' : 'font-semibold'}`}>
                  {item.label}
                </span>
                {!item.done && item.action && (
                  <Link
                    href={item.action.href}
                    className="shrink-0 rounded-md border border-green-600 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
                  >
                    {item.action.label}
                  </Link>
                )}
              </div>
              {!item.done && item.description && (
                <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
