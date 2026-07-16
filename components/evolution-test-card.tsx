'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, MessageCircle } from 'lucide-react'

interface Props {
  enabled: boolean
  instance: string | null
}

export function EvolutionTestCard({ enabled, instance }: Props) {
  const [number, setNumber] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function sendTest() {
    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch('/api/whatsapp/evolution/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }

      if (!response.ok) {
        setStatus('error')
        setMessage(data.message || data.error || 'Não foi possível enviar a mensagem de teste.')
        return
      }

      setStatus('ok')
      setMessage('Mensagem de teste enviada pela Evolution API.')
    } catch {
      setStatus('error')
      setMessage('Falha de comunicação com o servidor. Tente novamente.')
    }
  }

  return (
    <div className="mx-4 mt-4 rounded-xl border border-gray-200 bg-white p-5 md:mx-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-gray-900">WhatsApp de testes — Evolution API</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {enabled ? `Conectada${instance ? ` · ${instance}` : ''}` : 'Não configurada'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Envie uma mensagem simples para confirmar a conexão. Nos agendamentos, o telefone informado pelo cliente será usado automaticamente.
          </p>
        </div>

        <div className="flex w-full gap-2 md:w-auto">
          <input
            type="tel"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder="5551999999999"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 md:w-48"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={!enabled || !number.trim() || status === 'loading'}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
            Testar
          </button>
        </div>
      </div>

      {status === 'ok' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />{message}
        </div>
      )}
      {status === 'error' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />{message}
        </div>
      )}
    </div>
  )
}
