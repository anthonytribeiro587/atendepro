import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Skip auth and middleware — must respond even if Supabase is unreachable
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
