'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CalendarCheck2, CalendarDays, ChevronDown, Loader2 } from 'lucide-react'
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

interface DateOption {
  value: string
  label: string
}

const defaultHours: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day_of_week: day,
  is_open: day >= 1 && day <= 5,
  open_time: '09:00',
  close_time: '18:00',
}))

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function datePartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day') }
}

function generateSlots(openTime: string, closeTime: string, duration: number) {
  const [openHour, openMinute] = openTime.slice(0, 5).split(':').map(Number)
  const [closeHour, closeMinute] = closeTime.slice(0, 5).split(':').map(Number)
  const start = openHour * 60 + openMinute
  const end = closeHour * 60 + closeMinute
  const slots: string[] = []

  for (let current = start; current + duration <= end; current += duration) {
    slots.push(`${pad(Math.floor(current / 60))}:${pad(current % 60)}`)
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

function formatDateLabel(date: Date, index: number) {
  const full = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date)

  const capitalized = full.charAt(0).toUpperCase() + full.slice(1)
  if (index === 0) return `Hoje — ${capitalized}`
  if (index === 1) return `Amanhã — ${capitalized}`
  return capitalized
}

export function PublicBookingFormV2({ business, services, employees, workingHours }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const timezone = business.timezone || 'America/Sao_Paulo'
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
  const effectiveHours = useMemo(
    () => defaultHours.map((fallback) => workingHours.find((item) => item.day_of_week === fallback.day_of_week) ?? fallback),
    [workingHours]
  )

  const today = useMemo(() => {
    const parts = datePartsInTimezone(new Date(), timezone)
    return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0)
  }, [timezone])

  const todayValue = dateValue(today)

  const dateOptions = useMemo<DateOption[]>(() => {
    const options: DateOption[] = []

    for (let offset = 0; offset < 60; offset += 1) {
      const candidate = new Date(today)
      candidate.setDate(today.getDate() + offset)
      const rule = effectiveHours.find((item) => item.day_of_week === candidate.getDay())
      if (!rule?.is_open) continue

      options.push({
        value: dateValue(candidate),
        label: formatDateLabel(candidate, offset),
      })
    }

    return options
  }, [effectiveHours, today])

  useEffect(() => {
    if (employees.length === 1) setEmployeeId(employees[0].id)
  }, [employees])

  useEffect(() => {
    const service = selectedService

    if (!date || !service) {
      setAvailableSlots([])
      setTime('')
      return
    }

    const serviceDuration = service.duration_min
    let cancelled = false

    async function loadSlots() {
      setLoadingSlots(true)
      setError('')
      setTime('')

      try {
        const [year, month, day] = date.split('-').map(Number)
        const selectedDate = new Date(year, month - 1, day, 12, 0, 0)
        const hours = effectiveHours.find((item) => item.day_of_week === selectedDate.getDay())

        if (!hours?.is_open) {
          if (!cancelled) setAvailableSlots([])
          return
        }

        let slots = generateSlots(hours.open_time, hours.close_time, serviceDuration)

        const { data: booked, error: bookedError } = await supabase.rpc('get_booked_slots', {
          p_business_id: business.id,
          p_date: date,
          p_employee_id: employeeId || null,
        })

        if (bookedError) throw new Error(bookedError.message)

        slots = slots.filter((slot) => {
          const [hour, minute] = slot.split(':').map(Number)
          const start = hour * 60 + minute
          const end = start + serviceDuration

          return !(booked ?? []).some((appointment: { starts_at: string; ends_at: string }) => {
            const bookedStart = minutesInTimezone(appointment.starts_at, timezone)
            const bookedEnd = minutesInTimezone(appointment.ends_at, timezone)
            return start < bookedEnd && end > bookedStart
          })
        })

        if (date === todayValue) {
          const minimum = minutesInTimezone(new Date().toISOString(), timezone) + 30
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

    void loadSlots()
    return () => {
      cancelled = true
    }
  }, [business.id, date, effectiveHours, employeeId, selectedService, supabase, timezone, todayValue])

  async function submit() {
    if (!selectedService || !date || !time || !name.trim()) {
      setError('Escolha o serviço, a data, o horário e informe seu nome.')
      return
    }
    if (!phone.trim() && !email.trim()) {
      setError('Informe seu WhatsApp ou e-mail para receber a confirmação.')
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
        setError(payload.message || 'Não foi possível concluir o agendamento. Tente novamente.')
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
    const selectedDate = new Date(`${date}T12:00:00`)

    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-7 text-center shadow-sm sm:p-8">
        <CalendarCheck2 className="mx-auto h-14 w-14 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-semibold text-gray-900">Agendamento confirmado!</h2>
        <p className="mt-2 text-gray-600">
          {selectedService?.name} em {selectedDate.toLocaleDateString('pt-BR')} às {time}.
        </p>
        <p className="mt-1 text-sm text-gray-500">Você receberá a confirmação no contato informado.</p>
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
    <div className="space-y-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">Agendamento online</span>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">Escolha seu horário</h1>
        <p className="mt-1 text-sm text-stone-500">É rápido: escolha o serviço, a data e confirme seus dados.</p>
      </div>

      <section>
        <label className="mb-2 block text-sm font-medium text-stone-800">1. Serviço</label>
        <div className="space-y-2">
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => setServiceId(service.id)}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${serviceId === service.id ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900' : 'border-stone-200 hover:border-stone-400'}`}
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
      </section>

      {employees.length > 1 && (
        <section>
          <label className="mb-2 block text-sm font-medium text-stone-800">2. Profissional</label>
          <div className="relative">
            <select
              value={employeeId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setEmployeeId(event.target.value)}
              className="w-full appearance-none rounded-xl border border-stone-200 bg-white px-4 py-3 pr-11 outline-none focus:border-stone-500"
            >
              <option value="">Qualquer profissional disponível</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
          </div>
        </section>
      )}

      <section>
        <label className="mb-2 block text-sm font-medium text-stone-800">{employees.length > 1 ? '3' : '2'}. Data</label>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500" />
          <select
            value={date}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setDate(event.target.value)}
            className="min-h-12 w-full appearance-none rounded-xl border border-stone-200 bg-white py-3 pl-12 pr-11 text-base outline-none focus:border-stone-500"
          >
            <option value="">Selecione uma data</option>
            {dateOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
        </div>
        <p className="mt-1.5 text-xs text-stone-400">Mostramos somente os dias em que o estabelecimento atende.</p>
      </section>

      {date && (
        <section>
          <label className="mb-2 block text-sm font-medium text-stone-800">{employees.length > 1 ? '4' : '3'}. Horário</label>
          {loadingSlots ? (
            <div className="flex items-center gap-2 rounded-xl bg-stone-50 p-4 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando horários...
            </div>
          ) : availableSlots.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTime(slot)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${time === slot ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-700 hover:border-stone-500'}`}
                >
                  {slot}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">Não há horários disponíveis nessa data. Escolha outro dia.</p>
          )}
        </section>
      )}

      <section className="space-y-3 border-t border-stone-100 pt-5">
        <h2 className="font-semibold text-stone-900">{employees.length > 1 ? '5' : '4'}. Seus dados</h2>
        <input
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          placeholder="Seu nome *"
          autoComplete="name"
          className="min-h-12 w-full rounded-xl border border-stone-200 px-4 py-3 text-base outline-none focus:border-stone-500"
        />
        <input
          value={phone}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.target.value)}
          placeholder="WhatsApp com DDD"
          inputMode="tel"
          autoComplete="tel"
          className="min-h-12 w-full rounded-xl border border-stone-200 px-4 py-3 text-base outline-none focus:border-stone-500"
        />
        <input
          value={email}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
          placeholder="E-mail (opcional)"
          type="email"
          inputMode="email"
          autoComplete="email"
          className="min-h-12 w-full rounded-xl border border-stone-200 px-4 py-3 text-base outline-none focus:border-stone-500"
        />
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || !selectedService || !date || !time || !name.trim() || (!phone.trim() && !email.trim())}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? 'Confirmando...' : 'Confirmar agendamento'}
      </button>

      <p className="text-center text-xs text-stone-400">Sem cadastro necessário</p>
    </div>
  )
}
