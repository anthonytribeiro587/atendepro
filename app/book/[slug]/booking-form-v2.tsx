'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Service {
  id: string
  name: string
  description: string | null
  price: number
  duration_min: number
  category: string | null
  capacity: number
}

interface Employee {
  id: string
  name: string
}

interface Business {
  id: string
  name: string
  currency: string
  slug: string
  timezone: string | null
  address?: string | null
}

interface DayHours {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
}

interface Props {
  business: Business
  services: Service[]
  employees: Employee[]
  workingHours: DayHours[]
  telegramBotUsername: string | null
  viberBotUri: string | null
}

const defaultHours: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day_of_week: day,
  is_open: day >= 1 && day <= 5,
  open_time: '09:00',
  close_time: '18:00',
}))

function generateSlots(openTime: string, closeTime: string, duration: number) {
  const [openHour, openMinute] = openTime.slice(0, 5).split(':').map(Number)
  const [closeHour, closeMinute] = closeTime.slice(0, 5).split(':').map(Number)
  const start = openHour * 60 + openMinute
  const end = closeHour * 60 + closeMinute
  const slots: string[] = []

  for (let current = start; current + duration <= end; current += duration) {
    slots.push(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`)
  }

  return slots
}

function minutesInTimezone(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

export function PublicBookingFormV2({ business, services, employees, workingHours }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [employeeId, setEmployeeId] = useState(employees.length === 1 ? employees[0].id : '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const selectedService = services.find((service) => service.id === serviceId) ?? null
  const today = new Date().toISOString().slice(0, 10)

  const effectiveHours = useMemo(
    () => defaultHours.map((fallback) => workingHours.find((item) => item.day_of_week === fallback.day_of_week) ?? fallback),
    [workingHours]
  )

  useEffect(() => {
    if (employees.length === 1) setEmployeeId(employees[0].id)
  }, [employees])

  useEffect(() => {
    if (!date || !selectedService) {
      setAvailableSlots([])
      setTime('')
      return
    }

    let cancelled = false

    async function loadSlots() {
      setLoadingSlots(true)
      setError('')
      setTime('')

      try {
        const dayOfWeek = new Date(`${date}T12:00:00`).getDay()
        const hours = effectiveHours.find((item) => item.day_of_week === dayOfWeek)

        if (!hours?.is_open) {
          if (!cancelled) setAvailableSlots([])
          return
        }

        let slots = generateSlots(hours.open_time, hours.close_time, selectedService.duration_min)
        const timezone = business.timezone || 'America/Sao_Paulo'

        const { data: booked, error: bookedError } = await supabase.rpc('get_booked_slots', {
          p_business_id: business.id,
          p_date: date,
          p_employee_id: employeeId || null,
        })

        if (bookedError) throw new Error(bookedError.message)

        slots = slots.filter((slot) => {
          const [hour, minute] = slot.split(':').map(Number)
          const start = hour * 60 + minute
          const end = start + selectedService.duration_min

          return !(booked ?? []).some((appointment: { starts_at: string; ends_at: string }) => {
            const bookedStart = minutesInTimezone(appointment.starts_at, timezone)
            const bookedEnd = minutesInTimezone(appointment.ends_at, timezone)
            return start < bookedEnd && end > bookedStart
          })
        })

        if (date === today) {
          const now = new Date()
          const minimum = now.getHours() * 60 + now.getMinutes() + 30
          slots = slots.filter((slot) => {
            const [hour, minute] = slot.split(':').map(Number)
            return hour * 60 + minute > minimum
          })
        }

        if (!cancelled) setAvailableSlots(slots)
      } catch (slotError) {
        if (!cancelled) {
          setAvailableSlots([])
          setError(slotError instanceof Error ? slotError.message : 'Não foi possível carregar os horários.')
        }
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    }

    loadSlots()
    return () => {
      cancelled = true
    }
  }, [business.id, business.timezone, date, effectiveHours, employeeId, selectedService, supabase, today])

  async function submit() {
    if (!selectedService || !date || !time || !name.trim()) {
      setError('Preencha o serviço, a data, o horário e o nome.')
      return
    }
    if (!phone.trim() && !email.trim()) {
      setError('Informe um telefone ou e-mail para receber a confirmação.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/public-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          serviceId: selectedService.id,
          employeeId: employeeId || null,
          date,
          time,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
        }),
      })

      const payload = await response.json().catch(() => ({
        error: 'invalid_server_response',
        message: 'O servidor retornou uma resposta inválida.',
      })) as { error?: string; message?: string }

      if (!response.ok) {
        setError(`${payload.message || 'Não foi possível concluir o agendamento.'}${payload.error ? ` (código: ${payload.error})` : ''}`)
        return
      }

      setSuccess(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha de comunicação com o servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <CalendarCheck2 className="mx-auto h-14 w-14 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-semibold text-gray-900">Agendamento confirmado!</h2>
        <p className="mt-2 text-gray-600">
          {selectedService?.name} em {new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')} às {time}.
        </p>
        <p className="mt-1 text-sm text-gray-500">A confirmação será enviada para o contato informado.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl bg-gray-900 px-5 py-3 font-medium text-white"
        >
          Fazer outro agendamento
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
      <div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">Agendamento online</span>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">Escolha seu horário</h1>
        <p className="mt-1 text-sm text-stone-500">Preencha os dados abaixo para confirmar.</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-800">Serviço</label>
        <div className="space-y-2">
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => setServiceId(service.id)}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${serviceId === service.id ? 'border-stone-900 bg-stone-50' : 'border-stone-200 hover:border-stone-400'}`}
            >
              <span>
                <span className="block font-medium text-stone-900">{service.name}</span>
                <span className="text-sm text-stone-500">{service.duration_min} minutos</span>
              </span>
              <span className="font-semibold text-stone-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: business.currency || 'BRL' }).format(service.price)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {employees.length > 1 && (
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-800">Profissional</label>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500"
          >
            <option value="">Qualquer profissional</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-800">Data</label>
        <input
          type="date"
          min={today}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500"
        />
      </div>

      {date && (
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-800">Horário</label>
          {loadingSlots ? (
            <div className="flex items-center gap-2 py-4 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando horários...</div>
          ) : availableSlots.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTime(slot)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${time === slot ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-700 hover:border-stone-500'}`}
                >
                  {slot}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">Não há horários disponíveis nesta data.</p>
          )}
        </div>
      )}

      <div className="space-y-3 border-t border-stone-100 pt-5">
        <h2 className="font-semibold text-stone-900">Seus dados</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome *" className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500" />
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="WhatsApp com DDD" type="tel" className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500" />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail (opcional)" type="email" className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500" />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !time}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
        {submitting ? 'Confirmando...' : 'Confirmar agendamento'}
      </button>

      <p className="text-center text-xs text-stone-400">Sem cadastro necessário</p>
    </div>
  )
}
