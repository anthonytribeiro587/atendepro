-- AtendePRO runtime compatibility patch
-- Adds optional columns referenced by the settings, notification, loyalty
-- and custom-domain screens. Safe to run more than once.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS meta_whatsapp_phone_number_id text,
  ADD COLUMN IF NOT EXISTS meta_whatsapp_access_token text,
  ADD COLUMN IF NOT EXISTS wa_template_confirmation text,
  ADD COLUMN IF NOT EXISTS wa_template_reminder text,
  ADD COLUMN IF NOT EXISTS wa_template_thankyou text,
  ADD COLUMN IF NOT EXISTS wa_template_reactivation text,
  ADD COLUMN IF NOT EXISTS wa_template_birthday text,
  ADD COLUMN IF NOT EXISTS wa_template_language text DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS notification_language text DEFAULT 'pt',
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS custom_domain_status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS loyalty_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyalty_points_per_dollar numeric(10,2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS loyalty_min_redeem_points integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS loyalty_redeem_value numeric(10,2) DEFAULT 5;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS viber_user_id text;

UPDATE public.businesses
SET
  notification_language = COALESCE(notification_language, 'pt'),
  wa_template_language = COALESCE(wa_template_language, 'pt_BR'),
  custom_domain_status = COALESCE(custom_domain_status, 'inactive'),
  loyalty_enabled = COALESCE(loyalty_enabled, false),
  loyalty_points_per_dollar = COALESCE(loyalty_points_per_dollar, 1),
  loyalty_min_redeem_points = COALESCE(loyalty_min_redeem_points, 100),
  loyalty_redeem_value = COALESCE(loyalty_redeem_value, 5);

-- Restrict stored provider secrets to authenticated tenant access through RLS.
REVOKE SELECT (meta_whatsapp_access_token, smtp_pass, resend_api_key)
ON public.businesses FROM anon;
