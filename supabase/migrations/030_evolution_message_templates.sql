-- AtendePRO: templates de mensagens da Evolution API por empresa.
-- Execute uma vez no SQL Editor do Supabase.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS evolution_template_confirmation text,
  ADD COLUMN IF NOT EXISTS evolution_template_reminder_24h text,
  ADD COLUMN IF NOT EXISTS evolution_template_reminder_1h text,
  ADD COLUMN IF NOT EXISTS evolution_template_thankyou text,
  ADD COLUMN IF NOT EXISTS evolution_template_reactivation text,
  ADD COLUMN IF NOT EXISTS evolution_template_birthday text;

UPDATE public.businesses
SET
  evolution_template_confirmation = COALESCE(evolution_template_confirmation, $$✅ *Agendamento confirmado!*

Olá, {{cliente}}!
Seu horário foi reservado com sucesso.

*Serviço:* {{servico}}
*Data:* {{data}}
*Horário:* {{hora}}
*Profissional:* {{profissional}}
*Endereço:* {{endereco}}

Até breve! — {{empresa}}$$),
  evolution_template_reminder_24h = COALESCE(evolution_template_reminder_24h, $$📅 *Lembrete de agendamento*

Olá, {{cliente}}!
Passando para lembrar que seu atendimento é amanhã.

*Serviço:* {{servico}}
*Data:* {{data}}
*Horário:* {{hora}}
*Profissional:* {{profissional}}
*Endereço:* {{endereco}}

Esperamos você! — {{empresa}}$$),
  evolution_template_reminder_1h = COALESCE(evolution_template_reminder_1h, $$⏰ *Seu atendimento está próximo!*

Olá, {{cliente}}!
Seu horário começa em aproximadamente 1 hora.

*Serviço:* {{servico}}
*Horário:* {{hora}}
*Profissional:* {{profissional}}
*Endereço:* {{endereco}}

Até já! — {{empresa}}$$),
  evolution_template_thankyou = COALESCE(evolution_template_thankyou, $$💚 *Obrigado pela visita!*

Olá, {{cliente}}!
Foi um prazer atender você em *{{servico}}*.

Esperamos ver você novamente!
{{link_agendamento}}

— {{empresa}}$$),
  evolution_template_reactivation = COALESCE(evolution_template_reactivation, $$👋 *Sentimos sua falta, {{cliente}}!*

Já faz algum tempo desde sua última visita ao {{empresa}}.
Será um prazer receber você novamente.

{{link_agendamento}}$$),
  evolution_template_birthday = COALESCE(evolution_template_birthday, $$🎂 *Feliz aniversário, {{cliente}}!*

Toda a equipe do {{empresa}} deseja um dia maravilhoso para você.
Que tal reservar um momento especial?

{{link_agendamento}}$$);

COMMENT ON COLUMN public.businesses.evolution_template_confirmation IS
  'Mensagem da Evolution enviada quando um agendamento é confirmado.';
COMMENT ON COLUMN public.businesses.evolution_template_reminder_24h IS
  'Mensagem da Evolution enviada aproximadamente 24 horas antes.';
COMMENT ON COLUMN public.businesses.evolution_template_reminder_1h IS
  'Mensagem da Evolution enviada aproximadamente 1 hora antes.';
COMMENT ON COLUMN public.businesses.evolution_template_thankyou IS
  'Mensagem da Evolution enviada após a conclusão do atendimento.';
COMMENT ON COLUMN public.businesses.evolution_template_reactivation IS
  'Mensagem da Evolution para reativar clientes sem retorno.';
COMMENT ON COLUMN public.businesses.evolution_template_birthday IS
  'Mensagem de aniversário enviada pela Evolution.';
