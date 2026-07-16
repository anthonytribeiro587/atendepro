import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonError(error: string, message: string, status = 400) {
  return NextResponse.json({ error, message }, { status })
}

function normalizeApiUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().replace(/\/+$/, '')
  if (!normalized) return ''

  const parsed = new URL(normalized)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('A URL deve começar com http:// ou https://.')
  }
  return normalized
}

export async function POST(request: NextRequest) {
  try {
    const authClient = createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return jsonError('unauthorized', 'Faça login novamente.', 401)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonError('server_not_configured', 'As credenciais do Supabase não estão configuradas.', 500)
    }

    const body = await request.json() as {
      action?: 'save' | 'test'
      apiUrl?: string
      apiKey?: string
      instance?: string
      testNumber?: string
    }

    const action = body.action === 'test' ? 'test' : 'save'
    const apiUrl = normalizeApiUrl(body.apiUrl)
    const instance = body.instance?.trim().slice(0, 100) ?? ''
    const suppliedApiKey = body.apiKey?.trim() ?? ''

    if (!apiUrl || !instance) {
      return jsonError('missing_fields', 'Informe a URL da Evolution e o nome da instância.')
    }

    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: business, error: lookupError } = await admin
      .from('businesses')
      .select('id, evolution_api_key')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      const missingMigration = lookupError.message.includes('evolution_api_key')
      return jsonError(
        'business_lookup_failed',
        missingMigration
          ? 'Execute a migration 029_evolution_per_business.sql no Supabase.'
          : lookupError.message,
        500
      )
    }
    if (!business) return jsonError('business_not_found', 'Empresa não encontrada.', 404)

    const apiKey = suppliedApiKey || business.evolution_api_key || ''
    if (!apiKey) {
      return jsonError('missing_api_key', 'Informe a API key da Evolution.')
    }

    const { error: updateError } = await admin
      .from('businesses')
      .update({
        evolution_api_url: apiUrl,
        evolution_api_key: apiKey,
        evolution_instance: instance,
        evolution_enabled: true,
      })
      .eq('id', business.id)
      .eq('owner_id', user.id)

    if (updateError) {
      return jsonError('save_failed', updateError.message, 500)
    }

    if (action === 'test') {
      const number = normalizeWhatsAppNumber(body.testNumber ?? '')
      if (number.length < 12) {
        return jsonError('invalid_test_number', 'Informe o número no formato 55 + DDD + telefone.')
      }

      const evolutionResponse = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number,
          text: '✅ Evolution API conectada ao AtendePRO. A empresa já pode enviar confirmações de agendamento.',
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      })

      const responseText = await evolutionResponse.text().catch(() => '')
      if (!evolutionResponse.ok) {
        return jsonError(
          'evolution_send_failed',
          `A Evolution recusou o teste (HTTP ${evolutionResponse.status}). ${responseText.slice(0, 180)}`,
          502
        )
      }

      return NextResponse.json({
        ok: true,
        configured: true,
        message: 'Credenciais salvas e mensagem de teste enviada.',
      })
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      message: 'Integração Evolution salva para esta empresa.',
    })
  } catch (error) {
    return jsonError(
      'internal_error',
      error instanceof Error ? error.message : 'Erro interno ao configurar a Evolution.',
      500
    )
  }
}
