import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function uses12HourClock(locale: string): boolean {
  const sample = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(new Date(2000, 0, 1, 13))
  return /am|pm/i.test(sample)
}

export function formatTime(date: string | Date, locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: uses12HourClock(locale),
  }).format(new Date(date))
}

export function formatInBusinessTimezone(
  date: string | Date,
  timezone: string,
  part: 'date' | 'time' = 'date',
  locale = 'pt-BR'
): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone: timezone }
  if (part === 'date') {
    opts.year = 'numeric'; opts.month = 'short'; opts.day = 'numeric'
  } else {
    opts.hour = '2-digit'; opts.minute = '2-digit'; opts.hour12 = uses12HourClock(locale)
  }
  return new Intl.DateTimeFormat(locale, opts).format(new Date(date))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getTenantSlug(hostname: string, appDomain?: string): string | null {
  // agenda-cliente.suaempresa.com.br → agenda-cliente
  // localhost:3000 → null (desenvolvimento)
  if (!appDomain) return null

  const cleanHost = hostname.split(':')[0].toLowerCase()
  const cleanDomain = appDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()

  if (!cleanHost.endsWith(`.${cleanDomain}`)) return null
  const tenant = cleanHost.slice(0, -(cleanDomain.length + 1))
  return tenant && !tenant.includes('.') && tenant !== 'www' ? tenant : null
}
