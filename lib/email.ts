/**
 * Funções de envio de e-mail e modelos HTML do AtendePRO.
 * O transporte (Resend ou SMTP) é definido em lib/mailer.ts.
 */

import { sendMail, getFromAddress } from './mailer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function layout(businessName: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${businessName}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="background:#2563eb;padding:20px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;">${businessName}</span>
            </td>
          </tr>
          <tr><td style="padding:32px;">${body}</td></tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Enviado por <a href="${APP_URL}" style="color:#2563eb;text-decoration:none;">AtendePRO</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function btn(text: string, href: string) {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">${text}</a>`
}

function h1(text: string) {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">${text}</h1>`
}

function p(text: string) {
  return `<p style="margin:8px 0;font-size:15px;color:#374151;line-height:1.6;">${text}</p>`
}

function info(rows: [string, string][]) {
  const cells = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:14px;color:#6b7280;width:140px;border-bottom:1px solid #f3f4f6;">${label}</td>
      <td style="padding:8px 12px;font-size:14px;color:#111827;font-weight:500;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`
    )
    .join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${cells}</table>`
}

export async function sendBookingConfirmation(opts: {
  to: string
  clientName: string
  businessName: string
  serviceName: string
  date: string
  time: string
  employeeName?: string
  address?: string
  calendarUrl?: string
}) {
  const body = `
    ${h1('Agendamento confirmado!')}
    ${p(`Olá, ${firstName(opts.clientName)}! Seu horário foi confirmado com sucesso.`)}
    ${info([
      ['Serviço', opts.serviceName],
      ['Data', opts.date],
      ['Horário', opts.time],
      ...(opts.employeeName ? [['Profissional', opts.employeeName] as [string, string]] : []),
      ...(opts.address ? [['Endereço', opts.address] as [string, string]] : []),
    ])}
    ${p('Até breve!')}
    ${opts.calendarUrl ? p(`<a href="${opts.calendarUrl}" style="color:#2563eb;">Adicionar ao Google Agenda</a>`) : ''}
  `
  return sendMail({
    from: getFromAddress(opts.businessName),
    to: opts.to,
    subject: `Agendamento confirmado — ${opts.serviceName} às ${opts.time}`,
    html: layout(opts.businessName, body),
  })
}

export async function sendReminder(opts: {
  to: string
  clientName: string
  businessName: string
  serviceName: string
  date: string
  time: string
  employeeName?: string
  address?: string
  isOneHour?: boolean
}) {
  const when = opts.isOneHour ? 'em aproximadamente 1 hora' : 'amanhã'
  const body = `
    ${h1(`Lembrete: seu atendimento é ${when}`)}
    ${p(`Olá, ${firstName(opts.clientName)}! Este é um lembrete do seu próximo atendimento.`)}
    ${info([
      ['Serviço', opts.serviceName],
      ['Data', opts.date],
      ['Horário', opts.time],
      ...(opts.employeeName ? [['Profissional', opts.employeeName] as [string, string]] : []),
      ...(opts.address ? [['Endereço', opts.address] as [string, string]] : []),
    ])}
    ${p('Esperamos você!')}
  `
  return sendMail({
    from: getFromAddress(opts.businessName),
    to: opts.to,
    subject: `Lembrete: ${opts.serviceName} ${when}, às ${opts.time}`,
    html: layout(opts.businessName, body),
  })
}

export async function sendThankYou(opts: {
  to: string
  clientName: string
  businessName: string
  serviceName: string
  bookingUrl?: string
}) {
  const body = `
    ${h1('Obrigado pela sua visita!')}
    ${p(`Olá, ${firstName(opts.clientName)}! Obrigado por escolher ${opts.businessName}. Esperamos receber você novamente.`)}
    ${p(`Serviço realizado: <strong>${opts.serviceName}</strong>`)}
    ${opts.bookingUrl ? btn('Agendar próximo horário', opts.bookingUrl) : ''}
  `
  return sendMail({
    from: getFromAddress(opts.businessName),
    to: opts.to,
    subject: `Obrigado por visitar ${opts.businessName}!`,
    html: layout(opts.businessName, body),
  })
}

export async function sendReactivation(opts: {
  to: string
  clientName: string
  businessName: string
  bookingUrl?: string
}) {
  const body = `
    ${h1('Sentimos sua falta!')}
    ${p(`Olá, ${firstName(opts.clientName)}! Já faz algum tempo desde sua última visita ao ${opts.businessName}.`)}
    ${p('Será um prazer receber você novamente. Seu próximo agendamento leva apenas alguns instantes.')}
    ${opts.bookingUrl ? btn('Agendar agora', opts.bookingUrl) : ''}
  `
  return sendMail({
    from: getFromAddress(opts.businessName),
    to: opts.to,
    subject: `${opts.businessName} está com saudades — agende sua próxima visita`,
    html: layout(opts.businessName, body),
  })
}

export async function sendBirthday(opts: {
  to: string
  clientName: string
  businessName: string
  bookingUrl?: string
}) {
  const body = `
    ${h1('🎂 Feliz aniversário!')}
    ${p(`Olá, ${firstName(opts.clientName)}! Toda a equipe do ${opts.businessName} deseja um aniversário maravilhoso para você.`)}
    ${p('Aproveite o seu dia e reserve um momento especial para cuidar de você.')}
    ${opts.bookingUrl ? btn('Agendar um horário', opts.bookingUrl) : ''}
  `
  return sendMail({
    from: getFromAddress(opts.businessName),
    to: opts.to,
    subject: `Feliz aniversário — ${opts.businessName}! 🎂`,
    html: layout(opts.businessName, body),
  })
}

export async function sendLowStockAlert(opts: {
  to: string
  businessName: string
  items: { name: string; quantity: number; unit: string; threshold: number }[]
}) {
  const rows = opts.items.map(
    (item) => [item.name, `${item.quantity} ${item.unit} (mínimo: ${item.threshold})`] as [string, string]
  )
  const body = `
    ${h1('Alerta de estoque baixo')}
    ${p(`Os seguintes produtos do ${opts.businessName} estão com estoque baixo:`)}
    ${info(rows)}
    ${btn('Abrir estoque', `${APP_URL}/inventory`)}
  `
  return sendMail({
    from: getFromAddress(opts.businessName),
    to: opts.to,
    subject: `Alerta de estoque — ${opts.items.length} ${opts.items.length === 1 ? 'item precisa' : 'itens precisam'} de reposição`,
    html: layout(opts.businessName, body),
  })
}

function toTitleCase(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase('pt-BR'))
}

function firstName(name: string): string {
  return toTitleCase(name).split(/\s+/)[0]
}

export function formatEmailDate(iso: string, timezone = 'America/Sao_Paulo') {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: timezone,
  })
}

export function formatEmailTime(iso: string, timezone = 'America/Sao_Paulo') {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  })
}
