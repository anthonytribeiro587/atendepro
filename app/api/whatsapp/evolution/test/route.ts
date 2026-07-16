import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isEvolutionConfigured, normalizeWhatsAppNumber, sendWhatsAppMessage } from '@/lib/whatsapp'

const TestSchema = z.object({
  number: z.string().min(8).max(30),
})

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!isEvolutionConfigured()) {
    return NextResponse.json(
      { error: 'evolution_not_configured', message: 'Cadastre EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE na Vercel.' },
      { status: 503 }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = TestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_number', message: 'Informe um número com DDD e país.' }, { status: 422 })
  }

  const number = normalizeWhatsAppNumber(parsed.data.number)
  if (number.length < 12) {
    return NextResponse.json({ error: 'invalid_number', message: 'Use o formato 55 + DDD + número.' }, { status: 422 })
  }

  const sent = await sendWhatsAppMessage(
    number,
    `✅ Teste do AtendePRO concluído!\n\nA Evolution API está conectada e pronta para enviar confirmações de agendamento.`
  )

  if (!sent) {
    return NextResponse.json(
      { error: 'send_failed', message: 'A Evolution recusou o envio. Verifique a instância conectada e a API key.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ sent: true })
}
