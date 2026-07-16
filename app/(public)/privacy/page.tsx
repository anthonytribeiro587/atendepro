import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Política de Privacidade' }
export default function PrivacyPage() {
  return <article className="prose prose-slate max-w-none">
    <h1>Política de Privacidade</h1>
    <p><strong>Modelo inicial:</strong> revise esta política com orientação jurídica e adeque os dados reais antes da publicação.</p>
    <h2>Dados tratados</h2>
    <p>A plataforma pode tratar dados de conta, clientes, profissionais, serviços, agendamentos, vendas e configurações necessárias à operação.</p>
    <h2>Finalidade</h2>
    <p>Os dados são utilizados para autenticação, organização da agenda, execução dos serviços contratados, segurança e melhoria do produto.</p>
    <h2>Dados sensíveis</h2>
    <p>Informações de anamnese ou saúde exigem proteção adicional, acesso restrito e base legal adequada. Não habilite esse módulo comercialmente sem revisão de LGPD.</p>
    <h2>Contato</h2>
    <p>Substitua este trecho pelo canal oficial do controlador: contato@seudominio.com.br.</p>
  </article>
}
