'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck2, CheckCircle2, Loader2, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface Service {
  id: string
  name: string
  price: number
  duration_min: number
  category: string | null
}

interface Employee {
  id: string
  name: string
}

interface Client {
  id: string
  name: string
  phone: string | null
}

interface BookingContext {
  bookingId: string
  clientId: string
  serviceId: string
  staffId: string
  label: string
}

interface Props {
  businessId: string
  currency: string
  services: Service[]
  employees: Employee[]
  clients: Client[]
  bookingContext: BookingContext
}

interface CartItem {
  service: Service
  qty: number
}

type PaymentMethod = 'transfer' | 'cash' | 'card'

const paymentLabels: Record<PaymentMethod, string> = {
  transfer: 'Pix',
  cash: 'Dinheiro',
  card: 'Cartão',
}

export function FinishAppointmentTerminal({ currency, services, employees, clients, bookingContext }: Props) {
  const router = useRouter()
  const initialService = services.find((service) => service.id === bookingContext.serviceId)
  const [cart, setCart] = useState<CartItem[]>(initialService ? [{ service: initialService, qty: 1 }] : [])
  const [clientId, setClientId] = useState(bookingContext.clientId)
  const [employeeId, setEmployeeId] = useState(bookingContext.staffId)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer')
  const [discount, setDiscount] = useState(0)
  const [loadingAction, setLoadingAction] = useState<'paid' | 'unpaid' | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    paid: boolean
    receiptNumber?: string | null
    whatsappSent?: boolean
    emailSent?: boolean
  } | null>(null)

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.service.price * item.qty, 0),
    [cart]
  )
  const total = Math.max(0, subtotal - Math.max(0, discount))

  function addService(service: Service) {
    setCart((current) => {
      const existing = current.find((item) => item.service.id === service.id)
      if (existing) {
        return current.map((item) => item.service.id === service.id ? { ...item, qty: item.qty + 1 } : item)
      }
      return [...current, { service, qty: 1 }]
    })
  }

  function changeQuantity(serviceId: string, delta: number) {
    setCart((current) => current
      .map((item) => item.service.id === serviceId ? { ...item, qty: item.qty + delta } : item)
      .filter((item) => item.qty > 0))
  }

  async function finalize(paid: boolean) {
    if (cart.length === 0) {
      setError('Adicione pelo menos um serviço realizado.')
      return
    }

    setLoadingAction(paid ? 'paid' : 'unpaid')
    setError('')

    try {
      const response = await fetch(`/api/appointments/${bookingContext.bookingId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid,
          paymentMethod,
          amount: total,
          discount: Math.max(0, discount),
          clientId: clientId || null,
          employeeId: employeeId || null,
          items: cart.map((item) => ({
            serviceId: item.service.id,
            name: item.service.name,
            price: item.service.price,
            qty: item.qty,
          })),
        }),
      })

      const payload = await response.json().catch(() => ({
        error: 'invalid_response',
        message: 'O servidor retornou uma resposta inválida.',
      })) as {
        ok?: boolean
        error?: string
        message?: string
        receiptNumber?: string | null
        notification?: { whatsapp?: boolean; email?: boolean }
      }

      if (!response.ok) {
        setError(payload.message || payload.error || 'Não foi possível finalizar o atendimento.')
        return
      }

      setResult({
        paid,
        receiptNumber: payload.receiptNumber,
        whatsappSent: payload.notification?.whatsapp,
        emailSent: payload.notification?.email,
      })
      router.refresh()
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : 'Falha de comunicação com o servidor.')
    } finally {
      setLoadingAction(null)
    }
  }

  if (result) {
    const notified = result.whatsappSent || result.emailSent

    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="px-5 pb-7 pt-8 sm:px-8">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-500" />
            <h2 className="text-xl font-semibold text-gray-900">Atendimento concluído</h2>
            <p className="mt-2 text-sm text-gray-500">
              {result.paid ? 'Pagamento registrado e agenda atualizada.' : 'Agenda atualizada sem registrar recebimento.'}
            </p>
            {result.receiptNumber && (
              <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">Comprovante: {result.receiptNumber}</p>
            )}
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${notified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
              {notified
                ? 'O agradecimento foi enviado automaticamente para o cliente.'
                : 'Atendimento concluído. Nenhum canal de contato estava disponível para o agradecimento.'}
            </div>
            <Button className="mt-6 w-full" onClick={() => router.push('/booking')}>
              Voltar para a agenda
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-3 sm:p-6">
      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">{bookingContext.label}</p>
            <p className="mt-1 text-sm text-emerald-700">Confira o valor, escolha como recebeu e finalize. O status e as automações serão atualizados sozinhos.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="font-semibold text-gray-900">Serviços realizados</h2>
            <p className="mt-1 text-sm text-gray-500">O serviço agendado já está selecionado. Adicione outro somente quando necessário.</p>

            <div className="mt-4 space-y-3">
              {cart.map((item) => (
                <div key={item.service.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">{item.service.name}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(item.service.price, currency)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => changeQuantity(item.service.id, -1)} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Diminuir quantidade">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold">{item.qty}</span>
                    <button type="button" onClick={() => changeQuantity(item.service.id, 1)} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Aumentar quantidade">
                      <Plus className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setCart((current) => current.filter((cartItem) => cartItem.service.id !== item.service.id))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label="Remover serviço">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <details className="mt-4 rounded-xl border border-gray-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">Adicionar outro serviço</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {services.map((service) => (
                  <button key={service.id} type="button" onClick={() => addService(service)} className="rounded-lg border border-gray-200 p-3 text-left hover:border-emerald-400 hover:bg-emerald-50">
                    <span className="block text-sm font-medium text-gray-900">{service.name}</span>
                    <span className="text-xs text-gray-500">{formatCurrency(service.price, currency)}</span>
                  </button>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div>
              <label className="text-xs font-semibold uppercase text-gray-500">Cliente</label>
              <select value={clientId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setClientId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                <option value="">Cliente não informado</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </div>

            {employees.length > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase text-gray-500">Profissional</label>
                <select value={employeeId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setEmployeeId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                  <option value="">Sem profissional</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold uppercase text-gray-500">Desconto</label>
              <input type="number" min={0} max={subtotal} value={discount || ''} onChange={(event: ChangeEvent<HTMLInputElement>) => setDiscount(Number(event.target.value))} placeholder="0,00" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-gray-500">Como recebeu?</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(Object.keys(paymentLabels) as PaymentMethod[]).map((method) => (
                  <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`rounded-lg px-2 py-2.5 text-sm font-medium ${paymentMethod === method ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {paymentLabels[method]}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{formatCurrency(subtotal, currency)}</span></div>
              {discount > 0 && <div className="mt-1 flex justify-between text-sm text-red-500"><span>Desconto</span><span>- {formatCurrency(discount, currency)}</span></div>}
              <div className="mt-3 flex items-end justify-between border-t border-gray-200 pt-3">
                <span className="font-medium text-gray-700">Total</span>
                <span className="text-2xl font-bold text-gray-900">{formatCurrency(total, currency)}</span>
              </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <Button className="min-h-12 w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => void finalize(true)} disabled={Boolean(loadingAction) || cart.length === 0}>
              {loadingAction === 'paid' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar pagamento e concluir
            </Button>

            <button type="button" onClick={() => void finalize(false)} disabled={Boolean(loadingAction) || cart.length === 0} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              {loadingAction === 'unpaid' ? 'Concluindo...' : 'Concluir sem cobrar agora'}
            </button>
            <p className="text-center text-xs text-gray-400">Ao concluir, o cliente recebe automaticamente a mensagem de agradecimento.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
