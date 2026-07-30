import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

const SUPPORTED = ['en', 'es', 'pt'] as const
type Locale = (typeof SUPPORTED)[number]

function applyBrand(messages: unknown) {
  return JSON.parse(
    JSON.stringify(messages)
      .replaceAll('AtendePRO', 'Agelya')
      .replaceAll('atendepro', 'agelya')
  )
}

export default getRequestConfig(async () => {
  const raw = cookies().get('dashboard_locale')?.value ?? 'pt'
  const locale: Locale = (SUPPORTED as readonly string[]).includes(raw) ? (raw as Locale) : 'pt'
  const messages = (await import(`../messages/${locale}.json`)).default

  return {
    locale,
    messages: applyBrand(messages),
  }
})
