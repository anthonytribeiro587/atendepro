'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Loader2, MessageCircle } from 'lucide-react'

interface Props {
  initialApiUrl: string
  initialInstance: string
  configured: boolean
}

type Status = 'idle' | 'loading' | 'ok' | 'error'

function findMetaWhatsAppSection(): HTMLElement | null {
  const labels = Array.from(document.querySelectorAll('span'))
  const label = labels.find((element) => /meta cloud api/i.test(element.textContent ?? ''))
  const section = label?.parentElement?.parentElement
  return section instanceof HTMLElement ? section : null
}

export function EvolutionSettingsPortal({ initialApiUrl, initialInstance, configured }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [apiUrl, setApiUrl] = useState(initialApiUrl)
  const [instance, setInstance] = useState(initialInstance)
  const [apiKey, setApiKey] = useState('')
  const [testNumber, setTestNumber] = useState('')
  const [isConfigured, setIsConfigured] = useState(configured)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let currentSlot: HTMLElement | null = null

    const placePortal = () => {
      const section = findMetaWhatsAppSection()
      if (!section) {
        if (currentSlot && !document.body.contains(currentSlot)) currentSlot = null
        setTarget(null)
        return
      }

      let slot = document.getElementById('atendepro-evolution-settings-slot') as HTMLElement | null
      if (!slot) {
        slot = document.createElement('div')
        slot.id = 'atendepro-evolution-settings-slot'
        section.insertAdjacentElement('afterend', slot)
      }

      currentSlot = slot
      setTarget(slot)
    }

    placePortal()
    const observer = new MutationObserver(placePortal)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      currentSlot?.remove()
    }
  }, [])

  async function submit(action: 'save' | 'test') {
    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch('/api/settings/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          apiUrl,
          instance,
          apiKey,
          testNumber,
        }),
      })

      const payload = await response.json().catch(() => ({
        error: 'invalid_response',
        message: 'O servidor retornou uma resposta inválida.',
      })) as { ok?: boolean; configured?: boolean; message?: string; error?: string }

      if (!response.ok) {
        setStatus('error')
        setMessage(payload.message || payload.error || 'Não foi possível salvar a integração.')
        return
      }

      setStatus('ok')
      setMessage(payload.message || (action === 'test' ? 'Mensagem de teste enviada.' : 'Integração salva.'))
      setIsConfigured(Boolean(payload.configured ?? true))
      setApiKey('')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Falha de comunicação com o servidor.')
    }
  }

  if (!target) return null

  return createPortal(
    <>
      <hr className="my-6 border-gray-100" />
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            WhatsApp — Evolution API
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {isConfigured ? 'Configurado' : 'Não configurado'}
          </span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Módulo premium</span>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          Cada empresa pode conectar sua própria instância. As confirmações de agendamento usarão automaticamente estas credenciais.
        </p>

        <div className="space-y-2">
          <input
            type="url"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="URL da Evolution, ex.: https://evolution.seudominio.com"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="text"
            value={instance}
            onChange={(event) => setInstance(event.target.value)}
            placeholder="Nome da instância"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={isConfigured ? 'Nova API key (deixe vazio para manter a atual)' : 'API key da Evolution'}
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="tel"
            value={testNumber}
            onChange={(event) => setTestNumber(event.target.value)}
            placeholder="Número para teste: 5551999999999"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void submit('save')}
            disabled={status === 'loading' || !apiUrl.trim() || !instance.trim() || (!apiKey.trim() && !isConfigured)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Evolution
          </button>
          <button
            type="button"
            onClick={() => void submit('test')}
            disabled={status === 'loading' || !testNumber.trim() || !apiUrl.trim() || !instance.trim() || (!apiKey.trim() && !isConfigured)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Testar conexão
          </button>
        </div>

        {status === 'ok' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}
          </div>
        )}
        {status === 'error' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{message}
          </div>
        )}
      </div>
    </>,
    target
  )
}
