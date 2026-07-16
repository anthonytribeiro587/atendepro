/**
 * WhatsApp provider abstraction and message templates.
 *
 * Priority:
 * 1. Credentials saved for the current business/tenant.
 * 2. Shared environment variables used as a fallback/test instance.
 */

const META_BASE = 'https://graph.facebook.com/v20.0'

export interface WhatsAppCredentials {
  phoneNumberId?: string | null
  accessToken?: string | null
  evolutionApiUrl?: string | null
  evolutionApiKey?: string | null
  evolutionInstance?: string | null
}

export interface WhatsAppTemplateVariables {
  cliente?: string | null
  servico?: string | null
  data?: string | null
  hora?: string | null
  empresa?: string | null
  profissional?: string | null
  endereco?: string | null
  link_agendamento?: string | null
}

export interface EvolutionTemplates {
  confirmation: string
  reminder24h: string
  reminder1h: string
  thankyou: string
  reactivation: string
  birthday: string
}

export const DEFAULT_EVOLUTION_TEMPLATES: EvolutionTemplates = {
  confirmation: [
    '✅ *Agendamento confirmado!*',
    '',
    'Olá, {{cliente}}!',
    'Seu horário foi reservado com sucesso.',
    '',
    '*Serviço:* {{servico}}',
    '*Data:* {{data}}',
    '*Horário:* {{hora}}',
    '*Profissional:* {{profissional}}',
    '*Endereço:* {{endereco}}',
    '',
    'Até breve! — {{empresa}}',
  ].join('\n'),
  reminder24h: [
    '📅 *Lembrete de agendamento*',
    '',
    'Olá, {{cliente}}!',
    'Passando para lembrar que seu atendimento é amanhã.',
    '',
    '*Serviço:* {{servico}}',
    '*Data:* {{data}}',
    '*Horário:* {{hora}}',
    '*Profissional:* {{profissional}}',
    '*Endereço:* {{endereco}}',
    '',
    'Esperamos você! — {{empresa}}',
  ].join('\n'),
  reminder1h: [
    '⏰ *Seu atendimento está próximo!*',
    '',
    'Olá, {{cliente}}!',
    'Seu horário começa em aproximadamente 1 hora.',
    '',
    '*Serviço:* {{servico}}',
    '*Horário:* {{hora}}',
    '*Profissional:* {{profissional}}',
    '*Endereço:* {{endereco}}',
    '',
    'Até já! — {{empresa}}',
  ].join('\n'),
  thankyou: [
    '💚 *Obrigado pela visita!*',
    '',
    'Olá, {{cliente}}!',
    'Foi um prazer atender você em *{{servico}}*.',
    '',
    'Esperamos ver você novamente!',
    '{{link_agendamento}}',
    '',
    '— {{empresa}}',
  ].join('\n'),
  reactivation: [
    '👋 *Sentimos sua falta, {{cliente}}!*',
    '',
    'Já faz algum tempo desde sua última visita ao {{empresa}}.',
    'Será um prazer receber você novamente.',
    '',
    '{{link_agendamento}}',
  ].join('\n'),
  birthday: [
    '🎂 *Feliz aniversário, {{cliente}}!*',
    '',
    'Toda a equipe do {{empresa}} deseja um dia maravilhoso para você.',
    'Que tal reservar um momento especial?',
    '',
    '{{link_agendamento}}',
  ].join('\n'),
}

const PLACEHOLDER_PATTERN = /{{\s*(cliente|servico|data|hora|empresa|profissional|endereco|link_agendamento)\s*}}/gi

/**
 * Renders a tenant-defined Evolution template.
 * Lines containing an optional placeholder with no value are removed, avoiding
 * labels such as "Profissional:" or "Endereço:" without content.
 */
export function renderWhatsAppTemplate(
  template: string | null | undefined,
  variables: WhatsAppTemplateVariables,
  fallback: string
): string {
  const source = template?.trim() || fallback
  const values: Record<string, string> = {
    cliente: variables.cliente?.trim() || '',
    servico: variables.servico?.trim() || '',
    data: variables.data?.trim() || '',
    hora: variables.hora?.trim() || '',
    empresa: variables.empresa?.trim() || '',
    profissional: variables.profissional?.trim() || '',
    endereco: variables.endereco?.trim() || '',
    link_agendamento: variables.link_agendamento?.trim()
      ? `Agende seu próximo horário:\n${variables.link_agendamento.trim()}`
      : '',
  }

  const renderedLines = source.split('\n').flatMap((line) => {
    const placeholders = Array.from(line.matchAll(PLACEHOLDER_PATTERN))
    if (placeholders.some((match) => !values[match[1].toLowerCase()])) return []

    return [
      line.replace(PLACEHOLDER_PATTERN, (_match, key: string) => values[key.toLowerCase()] ?? ''),
    ]
  })

  return renderedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeWhatsAppNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length >= 12) digits = digits.slice(1)
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits
}

export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL &&
    process.env.EVOLUTION_API_KEY &&
    (process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME)
  )
}

async function sendWithEvolution(
  to: string,
  message: string,
  credentials?: WhatsAppCredentials
): Promise<boolean> {
  const baseUrl = (credentials?.evolutionApiUrl ?? process.env.EVOLUTION_API_URL)?.replace(/\/+$/, '')
  const apiKey = credentials?.evolutionApiKey ?? process.env.EVOLUTION_API_KEY
  const instance = credentials?.evolutionInstance ?? process.env.EVOLUTION_INSTANCE ?? process.env.EVOLUTION_INSTANCE_NAME

  if (!baseUrl || !apiKey || !instance) return false

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ number: to, text: message }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })

    const responseText = await res.text().catch(() => '')
    if (!res.ok) {
      console.error('[whatsapp:evolution] send error:', res.status, responseText)
      return false
    }

    return true
  } catch (err) {
    console.error('[whatsapp:evolution] exception:', err)
    return false
  }
}

async function sendWithMeta(
  to: string,
  message: string,
  credentials?: WhatsAppCredentials
): Promise<boolean> {
  const phoneNumberId = credentials?.phoneNumberId ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID
  const accessToken = credentials?.accessToken ?? process.env.META_WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) return false

  try {
    const res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      console.error('[whatsapp:meta] send error:', json?.error?.message ?? json)
      return false
    }

    return true
  } catch (err) {
    console.error('[whatsapp:meta] exception:', err)
    return false
  }
}

export async function sendWhatsAppMessage(
  to: string,
  message: string,
  credentials?: WhatsAppCredentials
): Promise<boolean> {
  const normalizedTo = normalizeWhatsAppNumber(to)
  if (!normalizedTo || !message.trim()) return false

  const hasBusinessEvolution = Boolean(
    credentials?.evolutionApiUrl &&
    credentials?.evolutionApiKey &&
    credentials?.evolutionInstance
  )
  const hasBusinessMeta = Boolean(credentials?.phoneNumberId && credentials?.accessToken)
  const configuredProvider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase()

  if (hasBusinessEvolution) return sendWithEvolution(normalizedTo, message, credentials)
  if (hasBusinessMeta) return sendWithMeta(normalizedTo, message, credentials)
  if (configuredProvider === 'evolution' || (configuredProvider !== 'meta' && isEvolutionConfigured())) {
    return sendWithEvolution(normalizedTo, message)
  }

  return sendWithMeta(normalizedTo, message)
}

export function tplBookingConfirmation(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  businessName: string
  employeeName?: string
  address?: string
}): string {
  return renderWhatsAppTemplate(
    DEFAULT_EVOLUTION_TEMPLATES.confirmation,
    {
      cliente: opts.clientName,
      servico: opts.serviceName,
      data: opts.date,
      hora: opts.time,
      empresa: opts.businessName,
      profissional: opts.employeeName,
      endereco: opts.address,
    },
    DEFAULT_EVOLUTION_TEMPLATES.confirmation
  )
}

export function tplReminder(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  businessName: string
  employeeName?: string
  address?: string
  isOneHour?: boolean
}): string {
  const template = opts.isOneHour
    ? DEFAULT_EVOLUTION_TEMPLATES.reminder1h
    : DEFAULT_EVOLUTION_TEMPLATES.reminder24h

  return renderWhatsAppTemplate(
    template,
    {
      cliente: opts.clientName,
      servico: opts.serviceName,
      data: opts.date,
      hora: opts.time,
      empresa: opts.businessName,
      profissional: opts.employeeName,
      endereco: opts.address,
    },
    template
  )
}

export function tplThankYou(opts: {
  clientName: string
  serviceName: string
  businessName: string
  bookingUrl?: string
}): string {
  return renderWhatsAppTemplate(
    DEFAULT_EVOLUTION_TEMPLATES.thankyou,
    {
      cliente: opts.clientName,
      servico: opts.serviceName,
      empresa: opts.businessName,
      link_agendamento: opts.bookingUrl,
    },
    DEFAULT_EVOLUTION_TEMPLATES.thankyou
  )
}

export function tplReactivation(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string
}): string {
  return renderWhatsAppTemplate(
    DEFAULT_EVOLUTION_TEMPLATES.reactivation,
    {
      cliente: opts.clientName,
      empresa: opts.businessName,
      link_agendamento: opts.bookingUrl,
    },
    DEFAULT_EVOLUTION_TEMPLATES.reactivation
  )
}

export function tplBirthday(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string
}): string {
  return renderWhatsAppTemplate(
    DEFAULT_EVOLUTION_TEMPLATES.birthday,
    {
      cliente: opts.clientName,
      empresa: opts.businessName,
      link_agendamento: opts.bookingUrl,
    },
    DEFAULT_EVOLUTION_TEMPLATES.birthday
  )
}

export function tplLowStock(opts: {
  itemName: string
  quantity: number
  unit: string
  threshold: number
}): string {
  return [
    '⚠️ *Alerta de estoque baixo*',
    '',
    `📦 ${opts.itemName}`,
    `Atual: ${opts.quantity} ${opts.unit} (mínimo: ${opts.threshold})`,
    '',
    'Providencie a reposição em breve.',
  ].join('\n')
}
