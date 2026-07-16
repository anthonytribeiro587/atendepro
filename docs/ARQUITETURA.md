# Arquitetura inicial

## Aplicação
Next.js App Router reúne páginas, componentes de painel e rotas de API.

## Dados
Supabase/PostgreSQL armazena empresas, usuários, clientes, agenda, serviços, produtos e vendas. Políticas RLS devem ser a barreira principal de isolamento por empresa.

## Agenda
O bloqueio de horários deve existir no banco, não apenas na interface. Requisições simultâneas precisam ser testadas antes da publicação.

## Autenticação
Supabase Auth. Rotas privadas são protegidas pelo middleware, mas cada consulta também deve respeitar RLS e vínculo com a empresa.

## Integrações
Notificações devem passar por filas ou rotinas idempotentes para evitar duplicidade. A Evolution API deve usar credenciais somente no servidor.

## Dados sensíveis
O futuro módulo de anamnese deve ser separado das observações comuns, com permissões específicas, registro de acesso e política de retenção.
