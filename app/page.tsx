import Link from 'next/link'
import { CalendarDays, CheckCircle2, HeartHandshake, MessageCircle, Scissors, Sparkles } from 'lucide-react'

const features = [
  { icon: CalendarDays, title: 'Agenda sem conflitos', text: 'Visualização diária e semanal, bloqueios, duração por serviço e reagendamento.' },
  { icon: HeartHandshake, title: 'Histórico de clientes', text: 'Atendimentos, preferências, observações, aniversário e frequência de retorno.' },
  { icon: Scissors, title: 'Serviços e profissionais', text: 'Preços, duração, comissão, cores na agenda e disponibilidade individual.' },
  { icon: MessageCircle, title: 'Relacionamento', text: 'Confirmações e lembretes preparados para integração com WhatsApp.' },
  { icon: Sparkles, title: 'Beleza e bem-estar', text: 'Estrutura preparada para salão, sobrancelhas, cílios, estética, spa e massoterapia.' },
  { icon: CheckCircle2, title: 'Gestão no mesmo painel', text: 'Caixa, vendas, produtos, estoque, fidelidade e indicadores essenciais.' },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7faf9] text-[#102a43]">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#18a999] text-white">
              <CalendarDays className="h-5 w-5" />
            </span>
            <span className="text-xl">Atende<span className="text-[#18a999]">PRO</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-lg px-4 py-2 text-sm font-semibold hover:bg-slate-100 sm:block">Entrar</Link>
            <Link href="/register" className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Criar conta</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:py-24">
        <div>
          <div className="mb-5 inline-flex rounded-full border border-[#18a999]/25 bg-[#18a999]/10 px-3 py-1 text-sm font-semibold text-[#117c72]">
            Agenda e gestão para beleza e bem-estar
          </div>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Organize seus atendimentos sem depender de caderno e mensagens perdidas.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Tenha agenda online, clientes, serviços, caixa e retornos em um único sistema, adaptado para cabeleireiras, designers de sobrancelhas e massoterapeutas.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="rounded-xl bg-[#18a999] px-6 py-3.5 text-center font-semibold text-white shadow-sm hover:opacity-90">Começar agora</Link>
            <Link href="/login" className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-center font-semibold hover:bg-slate-50">Acessar painel</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60">
          <div className="rounded-2xl bg-[#102a43] p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Agenda de hoje</p>
                <p className="mt-1 text-2xl font-bold">8 atendimentos</p>
              </div>
              <CalendarDays className="h-8 w-8 text-[#5eead4]" />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ['09:00', 'Design de sobrancelhas', 'Confirmado'],
              ['10:30', 'Corte + escova', 'Confirmado'],
              ['14:00', 'Massagem relaxante', 'A confirmar'],
              ['16:30', 'Retorno de coloração', 'Confirmado'],
            ].map(([time, service, status]) => (
              <div key={`${time}-${service}`} className="flex items-center gap-4 rounded-xl border border-slate-100 p-4">
                <span className="w-14 text-sm font-bold text-[#18a999]">{time}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{service}</p>
                  <p className="text-sm text-slate-500">{status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="max-w-2xl">
            <p className="font-semibold text-[#18a999]">Tudo em um só lugar</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Uma base pronta para evoluir com o negócio.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-slate-200 p-6">
                <Icon className="h-6 w-6 text-[#18a999]" />
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 AtendePRO. Versão inicial de desenvolvimento.</p>
        <div className="flex gap-4"><Link href="/terms">Termos</Link><Link href="/privacy">Privacidade</Link></div>
      </footer>
    </main>
  )
}
