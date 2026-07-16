import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const origin = request.nextUrl.origin
  const headers = { Authorization: authorization }

  const [clientResponse, businessResponse] = await Promise.allSettled([
    fetch(`${origin}/api/cron/notify`, { headers, cache: 'no-store' }),
    fetch(`${origin}/api/cron/business-alerts`, { headers, cache: 'no-store' }),
  ])

  async function readResult(result: PromiseSettledResult<Response>) {
    if (result.status === 'rejected') {
      return { ok: false, error: result.reason instanceof Error ? result.reason.message : 'request_failed' }
    }

    const body = await result.value.json().catch(() => null)
    return { ok: result.value.ok, status: result.value.status, body }
  }

  const [clients, business] = await Promise.all([
    readResult(clientResponse),
    readResult(businessResponse),
  ])

  return NextResponse.json({
    ok: Boolean(clients.ok && business.ok),
    clients,
    business,
  })
}
