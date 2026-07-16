import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Termos de Uso' }
export default function TermsPage() {
  return <article className="prose prose-slate max-w-none">
    <h1>Termos de Uso</h1>
    <p><strong>Modelo inicial:</strong> revise estes termos com orientação jurídica antes da publicação comercial.</p>
    <h2>Uso da plataforma</h2>
    <p>O AtendePRO é uma ferramenta de agenda e gestão. Cada empresa é responsável pelos dados cadastrados, pelas comunicações enviadas e pelo atendimento aos seus clientes.</p>
    <h2>Conta e segurança</h2>
    <p>O usuário deve manter suas credenciais protegidas e comunicar qualquer acesso não autorizado.</p>
    <h2>Disponibilidade</h2>
    <p>A plataforma pode receber atualizações e manutenções. Não há garantia de funcionamento ininterrupto nesta versão de desenvolvimento.</p>
    <h2>Contato</h2>
    <p>Substitua este trecho pelo canal oficial da empresa antes do lançamento: contato@seudominio.com.br.</p>
  </article>
}
