/**
 * WhatsApp provider abstraction.
 *
 * Supported providers:
 * - Evolution API: WHATSAPP_PROVIDER=evolution
 * - Meta Cloud API: WHATSAPP_PROVIDER=meta
 *
 * When WHATSAPP_PROVIDER is omitted, Evolution is preferred when all
 * EVOLUTION_* variables are present; otherwise Meta is used.
 */

const META_BASE = 'https://graph.facebook.com/v20.0'

export function normalizeWhatsAppNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '')

  // Remove Brazilian carrier prefix when a number was pasted as 0XX...
  if (digits.startsWith('0') && digits.length >= 12) digits = digits.slice(1)

  // Brazilian local number with DDD: add country code for WhatsApp/E.164.
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

async function sendWithEvolution(to: string, message: string): Promise<boolean> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME

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
  credentials?: { phoneNumberId: string; accessToken: string }
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
  credentials?: { phoneNumberId: string; accessToken: string }
): Promise<boolean> {
  const normalizedTo = normalizeWhatsAppNumber(to)
  if (!normalizedTo || !message.trim()) return false

  const configuredProvider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase()
  const shouldUseEvolution =
    configuredProvider === 'evolution' ||
    (!credentials && configuredProvider !== 'meta' && isEvolutionConfigured())

  if (shouldUseEvolution) {
    return sendWithEvolution(normalizedTo, message)
  }

  return sendWithMeta(normalizedTo, message, credentials)
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
  const lines = [
    `✅ Agendamento confirmado!`,
    ``,
    `Olá, ${opts.clientName}!`,
    `Seu horário foi reservado com sucesso:`,
    ``,
    `Serviço: ${opts.serviceName}`,
    `Data: ${opts.date} às ${opts.time}`,
  ]
  if (opts.employeeName) lines.push(`Profissional: ${opts.employeeName}`)
  if (opts.address) lines.push(`Endereço: ${opts.address}`)
  lines.push(``, `Até breve — ${opts.businessName}`)
  return lines.join('\n')
}

export function tplReminder(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  businessName: string
  isOneHour?: boolean
}): string {
  const when = opts.isOneHour ? 'em aproximadamente 1 hora ⏰' : 'amanhã 📅'
  return [
    `🔔 Lembrete de agendamento`,
    ``,
    `Olá, ${opts.clientName}!`,
    `Seu atendimento é ${when}:`,
    ``,
    `Serviço: ${opts.serviceName}`,
    `Data: ${opts.date} às ${opts.time}`,
    ``,
    `Até breve — ${opts.businessName}`,
  ].join('\n')
}

export function tplThankYou(opts: {
  clientName: string
  serviceName: string
  businessName: string
  bookingUrl?: string
}): string {
  const lines = [
    `✅ Obrigado pela visita!`,
    ``,
    `Olá, ${opts.clientName}!`,
    `Foi um prazer atender você em ${opts.serviceName}.`,
    ``,
    `Esperamos ver você novamente!`,
  ]
  if (opts.bookingUrl) {
    lines.push(``, `Agende seu próximo horário:`, opts.bookingUrl)
  }
  lines.push(``, `— ${opts.businessName}`)
  return lines.join('\n')
}

export function tplReactivation(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string
}): string {
  const lines = [
    `👋 Sentimos sua falta, ${opts.clientName}!`,
    ``,
    `Já faz algum tempo desde sua última visita ao ${opts.businessName}.`,
    `Será um prazer receber você novamente!`,
  ]
  if (opts.bookingUrl) {
    lines.push(``, `Agende seu horário:`, opts.bookingUrl)
  }
  return lines.join('\n')
}

export function tplBirthday(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string
}): string {
  const lines = [
    `🎂 Feliz aniversário, ${opts.clientName}!`,
    ``,
    `Toda a equipe do ${opts.businessName} deseja um dia maravilhoso para você.`,
  ]
  if (opts.bookingUrl) {
    lines.push(``, `Agende um momento especial:`, opts.bookingUrl)
  }
  return lines.join('\n')
}

export function tplLowStock(opts: {
  itemName: string
  quantity: number
  unit: string
  threshold: number
}): string {
  return [
    `⚠️ Alerta de estoque baixo`,
    ``,
    `📦 ${opts.itemName}`,
    `Atual: ${opts.quantity} ${opts.unit} (mínimo: ${opts.threshold})`,
    ``,
    `Providencie a reposição em breve.`,
  ].join('\n')
}
