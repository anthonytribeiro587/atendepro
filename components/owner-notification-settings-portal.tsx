'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, BellRing, CheckCircle2, Loader2, MessageCircle } from 'lucide-react'

interface Props {
  initialPhone: string
  initialNotifyNewBooking: boolean
  initialNotifyDailySummary: boolean
  initialDailySummaryTime: string
  initialNotifyNextAppointment: boolean
  initialNextAppointmentMinutes: number
}

type Status = 'idle' | 'loading' | 'ok' | 'error'

function findEvolutionSlot(): HTMLElement | null {
  const slot = document.getElementById('atendepro-evolution-settings-slot')
  return slot instanceof HTMLElement ? slot : null
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-3">
      <span>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-gray-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
      />
    </label>
  )
}

export function OwnerNotificationSettingsPortal({
  initialPhone,
  initialNotifyNewBooking,
  initialNotifyDailySummary,
  initialDailySummaryTime,
  initialNotifyNextAppointment,
  initialNextAppointmentMinutes,
}: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [phone, setPhone] = useState(initialPhone)
  const [notifyNewBooking, setNotifyNewBooking] = useState(initialNotifyNewBooking)
  const [notifyDailySummary, setNotifyDailySummary] = useState(initialNotifyDailySummary)
  const [dailySummaryTime, setDailySummaryTime] = useState(initialDailySummaryTime.slice(0, 5) || '20:00')
  const [notifyNextAppointment, setNotifyNextAppointment] = useState(initialNotifyNextAppointment)
  const [nextAppointmentMinutes, setNextAppointmentMinutes] = useState(initialNextAppointmentMinutes || 30)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let currentSlot: HTMLElement | null = null

    const placePortal = () => {
      const evolutionSlot = findEvolutionSlot()
      if (!evolutionSlot) {
        setTarget(null)
        return
      }

      let slot = document.getElementById('atendepro-owner-alerts-slot') as HTMLElement | null
      if (!slot) {
        slot = document.createElement('div')
        slot.id = 'atendepro-owner-alerts-slot'
        evolutionSlot.insertAdjacentElement('afterend', slot)
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
      const response = await fetch('/api/settings/owner-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          phone,
          notifyNewBooking,
          notifyDailySummary,
          dailySummaryTime,
          notifyNextAppointment,
          nextAppointmentMinutes,
        }),
      })

      const payload = await response.json().catch(() => ({
        error: 'invalid_response',
        message: 'O servidor retornou uma resposta inválida.',
      })) as { ok?: boolean; message?: string; error?: string }

      if (!response.ok) {
        setStatus('error')
        setMessage(payload.message || payload.error || 'Não foi possível salvar os avisos.')
        return
      }

      setStatus('ok')
      setMessage(payload.message || 'Configurações salvas.')
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
            <BellRing className="h-4 w-4 text-emerald-600" />
            Avisos para você e seu negócio
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Recomendado
          </span>
        </div>

        <p className="mb-4 text-xs leading-5 text-gray-500">
          Para quem trabalha sozinha, o mais simples é receber os novos horários no WhatsApp e acompanhar tudo pelo sino no topo do AtendePRO.
        </p>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <label className="text-xs font-semibold text-gray-700">WhatsApp que receberá os avisos</label>
          <div className="mt-1 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="5551999999999"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Pode ser o número da proprietária. As mensagens serão enviadas pela Evolution já configurada acima.
          </p>
        </div>

        <div className="mt-3 space-y-2">
          <Toggle
            checked={notifyNewBooking}
            onChange={setNotifyNewBooking}
            label="Avisar quando entrar um novo agendamento online"
            description="Chega imediatamente no WhatsApp e também na central de notificações do sistema."
          />

          <Toggle
            checked={notifyNextAppointment}
            onChange={setNotifyNextAppointment}
            label="Lembrar do próximo atendimento"
            description="Ajuda a profissional a se preparar sem precisar ficar conferindo a agenda."
          />

          {notifyNextAppointment && (
            <div className="ml-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <label className="text-xs font-medium text-gray-700">Avisar com antecedência de</label>
              <select
                value={nextAppointmentMinutes}
                onChange={(event) => setNextAppointmentMinutes(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
                <option value={90}>1 hora e 30 minutos</option>
                <option value={120}>2 horas</option>
              </select>
            </div>
          )}

          <Toggle
            checked={notifyDailySummary}
            onChange={setNotifyDailySummary}
            label="Receber o resumo da agenda do dia seguinte"
            description="Uma mensagem curta com horários, clientes e serviços para organizar o próximo dia."
          />

          {notifyDailySummary && (
            <div className="ml-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <label className="text-xs font-medium text-gray-700">Horário do resumo</label>
              <input
                type="time"
                value={dailySummaryTime}
                onChange={(event) => setDailySummaryTime(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void submit('save')}
            disabled={status === 'loading'}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar avisos
          </button>
          <button
            type="button"
            onClick={() => void submit('test')}
            disabled={status === 'loading' || !phone.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Enviar teste para mim
          </button>
        </div>

        <p className="mt-2 text-[11px] text-gray-400">
          O aviso de novo agendamento é imediato. Resumo diário e próximo atendimento usam a rotina automática do Vercel.
        </p>

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
