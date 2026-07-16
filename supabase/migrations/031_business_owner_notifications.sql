-- AtendePRO — avisos para o negócio e central interna de notificações
-- Execute uma única vez no SQL Editor do Supabase.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS owner_notification_phone text,
  ADD COLUMN IF NOT EXISTS notify_owner_new_booking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_owner_daily_summary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_daily_summary_time time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS notify_owner_next_appointment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_next_appointment_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_owner_next_appointment_minutes_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_owner_next_appointment_minutes_check
  CHECK (owner_next_appointment_minutes IN (15, 30, 60, 90, 120));

CREATE TABLE IF NOT EXISTS public.business_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  href text,
  ref_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_notifications_business_created
  ON public.business_notifications (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_notifications_unread
  ON public.business_notifications (business_id, read_at)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_notifications_ref
  ON public.business_notifications (business_id, type, ref_id)
  WHERE ref_id IS NOT NULL;

ALTER TABLE public.business_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read business notifications" ON public.business_notifications;
CREATE POLICY "Owners can read business notifications"
  ON public.business_notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_notifications.business_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update business notifications" ON public.business_notifications;
CREATE POLICY "Owners can update business notifications"
  ON public.business_notifications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_notifications.business_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_notifications.business_id
        AND b.owner_id = auth.uid()
    )
  );

COMMENT ON TABLE public.business_notifications IS
  'Central interna de avisos do AtendePRO para proprietários e equipes.';
