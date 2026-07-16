# AtendePRO

Aplicação web para agenda e gestão de profissionais de **beleza e bem-estar**, criada para evoluir como produto próprio.

## Público inicial

- Cabeleireiras e salões de beleza
- Designers de sobrancelhas e lash designers
- Massoterapeutas, esteticistas e spas

## Funcionalidades existentes na base

- Agenda diária e semanal com prevenção de conflito de horários
- Página pública de agendamento sem cadastro do cliente
- Cadastro de profissionais, serviços e disponibilidade
- CRM com clientes, histórico, aniversário, observações e tags
- Caixa/POS para serviços e produtos
- Produtos, estoque, movimentações e alertas
- Fidelidade e indicadores básicos
- Notificações por e-mail, Telegram, WhatsApp Cloud API e Viber
- Autenticação Supabase, banco PostgreSQL e políticas RLS
- PWA e execução via Docker

## Stack

- Next.js 14, React 18 e TypeScript
- Tailwind CSS
- Supabase: Auth, PostgreSQL, Storage e RLS
- Next.js API Routes
- Docker Compose

## Instalação local

### 1. Configure o ambiente

```bash
cp .env.example .env.local
```

Preencha no mínimo:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE
DATABASE_URL=postgresql://postgres...
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_DOMAIN=localhost
CRON_SECRET=troque-por-uma-chave-segura
```

Nunca publique `SUPABASE_SERVICE_ROLE_KEY` no navegador ou no repositório.

### 2. Instale e execute

```bash
npm install
npm run dev
```

Para validar um build mais rápido sem gerar o service worker:

```bash
DISABLE_PWA=true npm run build
```

Acesse `http://localhost:3000`.

## Banco de dados

As migrations estão em `supabase/migrations`. Antes de produção:

1. Crie um projeto no Supabase.
2. Revise as migrations em ordem.
3. Aplique as migrations no SQL Editor ou por CLI.
4. Crie o bucket público `inventory` para imagens de produtos.
5. Revise todas as políticas RLS com os perfis reais do negócio.

## Deploy na Vercel

1. Suba o projeto para um repositório Git próprio.
2. Importe o repositório na Vercel.
3. Cadastre as variáveis de ambiente.
4. Configure `NEXT_PUBLIC_APP_URL` com a URL de produção.
5. Cadastre a mesma URL em Supabase → Authentication → URL Configuration.

## Diretrizes do produto

- Idioma padrão: português do Brasil.
- Identidade atual: AtendePRO, provisória e substituível.
- Esta versão é uma fundação técnica; não está auditada para venda imediata.
- Anamnese e dados de saúde ainda não foram implementados nesta entrega.
- Integração com Evolution API deve ser feita como módulo separado.

## Próximos módulos recomendados

- Anamnese e termo de consentimento para massoterapia
- Pacotes de sessões e saldo restante
- Antes/depois e ficha técnica de coloração/sobrancelhas
- Sinal de reserva e política de cancelamento
- Evolution API para confirmação, lembrete e reativação
- Multiempresa com painel administrativo SaaS
- Auditoria de segurança, LGPD e isolamento por tenant

## Licença

O código permanece sob licença MIT. O arquivo `LICENSE` precisa acompanhar cópias ou distribuições substanciais do software. A interface, documentação e identidade visual desta versão foram adaptadas para o AtendePRO.

## Segurança antes do lançamento

- Execute `npm audit` em um ambiente com acesso ao registro npm.
- Revise especialmente importação/exportação de planilhas, upload de arquivos e integrações de mensageria.
- Não considere esta entrega uma auditoria de segurança concluída.
