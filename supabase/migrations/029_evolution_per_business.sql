-- AtendePRO: Evolution API por empresa/tenant.
-- Execute uma vez no SQL Editor do Supabase antes de publicar os arquivos.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS evolution_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evolution_api_url text,
  ADD COLUMN IF NOT EXISTS evolution_api_key text,
  ADD COLUMN IF NOT EXISTS evolution_instance text;

COMMENT ON COLUMN public.businesses.evolution_enabled IS
  'Ativa o envio de WhatsApp pela Evolution API para esta empresa.';
COMMENT ON COLUMN public.businesses.evolution_api_url IS
  'URL base da Evolution API, sem barra final.';
COMMENT ON COLUMN public.businesses.evolution_api_key IS
  'Credencial privada da Evolution API. Não deve ser enviada ao cliente.';
COMMENT ON COLUMN public.businesses.evolution_instance IS
  'Nome da instância Evolution conectada à empresa.';

-- Acesso público nunca deve visualizar a API key.
REVOKE SELECT (evolution_api_key) ON public.businesses FROM anon;
