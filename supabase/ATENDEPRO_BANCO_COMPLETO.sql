-- ================================================================
-- AtendePRO - Configuração completa do banco Supabase
-- Versão: 0.1.0
-- Uso: projeto Supabase NOVO e vazio
--
-- Execute uma única vez no Supabase:
-- SQL Editor -> New query -> cole o conteúdo -> Run
--
-- Inclui tabelas, relacionamentos, índices, funções, triggers,
-- RLS, políticas e o bucket público de imagens de produtos.
-- O pg_cron ficou fora porque depende da URL final da Vercel
-- e do CRON_SECRET.
-- ================================================================

BEGIN;


-- ================================================================
-- 001_initial_schema.sql
-- ================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ========================
-- BUSINESSES (tenants)
-- ========================
create table public.businesses (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  slug          text not null unique,
  type          text,                        -- salon, auto_repair, cafe, dental, fitness, other
  phone         text,
  email         text,
  address       text,
  timezone      text not null default 'UTC',
  currency      text not null default 'USD',
  logo_url      text,
  plan          text not null default 'free' check (plan in ('free','starter','pro','agency')),
  plan_expires_at timestamptz,
  telegram_bot_token text,
  viber_bot_token    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ========================
-- EMPLOYEES
-- ========================
create table public.employees (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  name          text not null,
  role          text not null default 'employee',
  phone         text,
  email         text,
  avatar_url    text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ========================
-- SERVICES
-- ========================
create table public.services (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric(10,2) not null default 0,
  duration_min  integer not null default 60,
  category      text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ========================
-- CLIENTS
-- ========================
create table public.clients (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  phone         text,
  email         text,
  notes         text,
  tags          text[] not null default '{}',
  telegram_id   text,
  viber_id      text,
  birthday      date,
  total_visits  integer not null default 0,
  total_spent   numeric(10,2) not null default 0,
  last_visit_at timestamptz,
  created_at    timestamptz not null default now()
);

-- ========================
-- APPOINTMENTS
-- ========================
create table public.appointments (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  employee_id   uuid references public.employees(id) on delete set null,
  service_id    uuid references public.services(id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'pending'
        check (status in ('pending','confirmed','completed','cancelled','no_show')),
  price         numeric(10,2),
  notes         text,
  source        text not null default 'manual'
        check (source in ('manual','online','telegram','viber')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ========================
-- TRANSACTIONS (POS)
-- ========================
create table public.transactions (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  appointment_id  uuid references public.appointments(id) on delete set null,
  client_id       uuid references public.clients(id) on delete set null,
  employee_id     uuid references public.employees(id) on delete set null,
  amount          numeric(10,2) not null,
  payment_method  text not null default 'cash'
          check (payment_method in ('cash','card','transfer','online')),
  status          text not null default 'completed'
          check (status in ('pending','completed','refunded')),
  items           jsonb not null default '[]',
  receipt_number  text unique,
  created_at      timestamptz not null default now()
);

-- ========================
-- INVENTORY
-- ========================
create table public.inventory_items (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  name                text not null,
  sku                 text,
  category            text,
  unit                text not null default 'pcs',
  quantity            numeric(10,3) not null default 0,
  low_stock_threshold numeric(10,3) not null default 5,
  cost_price          numeric(10,2),
  sell_price          numeric(10,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.inventory_movements (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id     uuid not null references public.inventory_items(id) on delete cascade,
  type        text not null check (type in ('in','out','adjustment')),
  quantity    numeric(10,3) not null,
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ========================
-- TABLE GRANTS
-- ========================
-- Required for PostgREST/supabase-js access (Supabase policy change, May 2026)
GRANT ALL ON TABLE public.businesses TO anon, authenticated;
GRANT ALL ON TABLE public.employees TO anon, authenticated;
GRANT ALL ON TABLE public.services TO anon, authenticated;
GRANT ALL ON TABLE public.clients TO anon, authenticated;
GRANT ALL ON TABLE public.appointments TO anon, authenticated;
GRANT ALL ON TABLE public.transactions TO anon, authenticated;
GRANT ALL ON TABLE public.inventory_items TO anon, authenticated;
GRANT ALL ON TABLE public.inventory_movements TO anon, authenticated;

-- ========================
-- INDEXES
-- ========================
create index idx_businesses_owner on public.businesses(owner_id);
create index idx_businesses_slug on public.businesses(slug);
create index idx_employees_business on public.employees(business_id);
create index idx_services_business on public.services(business_id);
create index idx_clients_business on public.clients(business_id);
create index idx_clients_phone on public.clients(business_id, phone);
create index idx_appointments_business on public.appointments(business_id);
create index idx_appointments_starts_at on public.appointments(business_id, starts_at);
create index idx_transactions_business on public.transactions(business_id);
create index idx_inventory_items_business on public.inventory_items(business_id);

-- ========================
-- ROW LEVEL SECURITY
-- ========================
alter table public.businesses enable row level security;
alter table public.employees enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.transactions enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

-- Businesses: owner sees their own
create policy "owner_access_businesses" on public.businesses
  for all using (owner_id = auth.uid());

-- Helper: current user's business IDs
create or replace function public.my_business_ids()
returns setof uuid language sql security definer stable as $$
  select id from public.businesses where owner_id = auth.uid()
  union
  select business_id from public.employees where user_id = auth.uid() and is_active = true
$$;

-- Generic policy for all tenant tables
create policy "tenant_access_employees" on public.employees
  for all using (business_id in (select public.my_business_ids()));

create policy "tenant_access_services" on public.services
  for all using (business_id in (select public.my_business_ids()));

create policy "tenant_access_clients" on public.clients
  for all using (business_id in (select public.my_business_ids()));

create policy "tenant_access_appointments" on public.appointments
  for all using (business_id in (select public.my_business_ids()));

create policy "tenant_access_transactions" on public.transactions
  for all using (business_id in (select public.my_business_ids()));

create policy "tenant_access_inventory_items" on public.inventory_items
  for all using (business_id in (select public.my_business_ids()));

create policy "tenant_access_inventory_movements" on public.inventory_movements
  for all using (business_id in (select public.my_business_ids()));

-- ========================
-- AUTO updated_at TRIGGER
-- ========================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_businesses_updated_at before update on public.businesses
  for each row execute procedure public.set_updated_at();

create trigger trg_appointments_updated_at before update on public.appointments
  for each row execute procedure public.set_updated_at();

create trigger trg_inventory_items_updated_at before update on public.inventory_items
  for each row execute procedure public.set_updated_at();

-- Auto-increment receipt number
create sequence public.receipt_seq start 1000;

create or replace function public.set_receipt_number()
returns trigger language plpgsql as $$
begin
  if new.receipt_number is null then
    new.receipt_number = 'REC-' || lpad(nextval('public.receipt_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_transactions_receipt before insert on public.transactions
  for each row execute procedure public.set_receipt_number();


-- ================================================================
-- 002_notification_log.sql
-- ================================================================

-- Notification log — prevents duplicate emails/messages being sent

create table if not exists notification_log (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  ref_id       text not null,          -- appointment id, client id, item id, etc.
  type         text not null,          -- 'confirm' | 'reminder_24h' | 'reminder_1h' | 'thankyou' | 'reactivation' | 'birthday' | 'low_stock'
  channel      text not null default 'email',
  sent_at      timestamptz not null default now()
);

GRANT ALL ON TABLE public.notification_log TO anon, authenticated;

create unique index notification_log_unique on notification_log (ref_id, type, channel);

-- RLS
alter table notification_log enable row level security;
create policy "business_isolation" on notification_log
  using (business_id in (select my_business_ids()));


-- ================================================================
-- 003_telegram_chat_id.sql
-- ================================================================

-- Добавляем telegram_chat_id в businesses
-- Сохраняется когда владелец пишет /start своему боту

alter table public.businesses
  add column if not exists telegram_chat_id text;


-- ================================================================
-- 004_billing.sql
-- ================================================================

-- Колонки для LemonSqueezy billing
alter table public.businesses
  add column if not exists ls_subscription_id text,
  add column if not exists ls_customer_id     text,
  add column if not exists ls_variant_id      text;


-- ================================================================
-- 005_security_fixes.sql
-- ================================================================

-- ============================================================
-- Security fixes (Supabase Security Advisor recommendations)
-- ============================================================

-- Fix: Function Search Path Mutable
-- Добавляем SET search_path = public ко всем нашим функциям

create or replace function public.my_business_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.businesses where owner_id = auth.uid()
  union
  select business_id from public.employees where user_id = auth.uid() and is_active = true
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_receipt_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.receipt_number is null then
    new.receipt_number = 'REC-' || lpad(nextval('public.receipt_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- Fix handle_new_user if it exists (may be from previous project)
-- Если функция существует — добавляем search_path
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    execute $func$
      create or replace function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $inner$
      begin
        return new;
      end;
      $inner$
    $func$;
  end if;
end;
$$;


-- ================================================================
-- 006_viber_user_id.sql
-- ================================================================

-- Миграция 006: Viber поддержка
--
-- Добавляем два поля:
--
-- 1. viber_chat_id в businesses — Viber ID владельца бизнеса.
--    Сохраняется когда владелец первый раз пишет боту (аналог telegram_chat_id).
--    Используется для отправки уведомлений ВЛАДЕЛЬЦУ:
--    новые записи, алерты low-stock, подтверждения визитов.
--
-- 2. viber_user_id в clients — Viber ID конкретного клиента.
--    Заполняется вручную в карточке клиента (CRM → клиент → редактировать).
--    В будущем можно автоматически через webhook, если клиент сам напишет боту.
--    Используется для отправки уведомлений КЛИЕНТАМ:
--    напоминания о записи, благодарность после визита, реактивация.

alter table public.businesses
  add column if not exists viber_chat_id text;

alter table public.clients
  add column if not exists viber_user_id text;


-- ================================================================
-- 008_client_stats_trigger.sql
-- ================================================================

-- Миграция 008: Автоматическое обновление статистики клиента
--
-- Проблема: поля total_visits и total_spent в таблице clients
-- не обновлялись при добавлении транзакции через POS.
-- Клиент покупал услугу, но в карточке оставалось 0.
--
-- Решение: триггер — автоматическое правило в базе данных.
-- Как только вставляется новая транзакция со статусом 'completed'
-- и привязанным клиентом — сразу пересчитываем его статистику.

create or replace function public.update_client_stats()
returns trigger language plpgsql as $$
begin
  -- Обрабатываем только завершённые транзакции с указанным клиентом
  if new.status = 'completed' and new.client_id is not null then
    update public.clients
    set
      total_visits = (
        select count(*)
        from public.transactions
        where client_id = new.client_id
and status = 'completed'
      ),
      total_spent = (
        select coalesce(sum(amount), 0)
        from public.transactions
        where client_id = new.client_id
and status = 'completed'
      ),
      last_visit_at = (
        select max(created_at)
        from public.transactions
        where client_id = new.client_id
and status = 'completed'
      )
    where id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger trg_transactions_update_client_stats
  after insert on public.transactions
  for each row execute procedure public.update_client_stats();

-- Пересчитываем статистику для всех существующих клиентов
-- (исправляет данные которые уже накопились до этой миграции)
update public.clients c
set
  total_visits = sub.visits,
  total_spent  = sub.spent,
  last_visit_at = sub.last_at
from (
  select
    client_id,
    count(*)                    as visits,
    coalesce(sum(amount), 0)    as spent,
    max(created_at)             as last_at
  from public.transactions
  where status = 'completed'
    and client_id is not null
  group by client_id
) sub
where c.id = sub.client_id;


-- ================================================================
-- 009_business_hours.sql
-- ================================================================

-- Миграция 009: Рабочие часы бизнеса
--
-- Добавляет таблицу business_hours — расписание работы по дням недели.
-- day_of_week: 0=Вс, 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб (JS-конвенция Date.getDay())
-- Дефолт: Пн–Пт 09:00–19:00 открыты, Сб–Вс закрыты.
--
-- Также добавляет публичные политики RLS для публичной страницы бронирования
-- и RPC-функцию get_booked_slots (security definer = обходит RLS, но не раскрывает
-- личные данные — возвращает только starts_at / ends_at занятых слотов).

-- ─── Таблица ─────────────────────────────────────────────────────────────────
create table public.business_hours (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_open     boolean not null default true,
  open_time   text not null default '09:00',  -- формат HH:MM
  close_time  text not null default '19:00',  -- формат HH:MM
  unique (business_id, day_of_week)
);

GRANT ALL ON TABLE public.business_hours TO anon, authenticated;

create index idx_business_hours_business on public.business_hours(business_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.business_hours enable row level security;

-- Владелец/сотрудник управляют своими часами
create policy "tenant_access_business_hours" on public.business_hours
  for all using (business_id in (select public.my_business_ids()));

-- Публичное чтение для виджета бронирования (страница /book/[slug])
create policy "public_read_business_hours" on public.business_hours
  for select using (true);

-- ─── Публичные политики чтения для /book/[slug] ───────────────────────────────
-- Без них анонимный Supabase-клиент получает пустые данные из-за RLS.
-- Политики безопасны: данные и так публичны (бизнес сам публикует страницу).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'businesses'
      and policyname = 'public_read_businesses_for_booking'
  ) then
    execute $p$
      create policy "public_read_businesses_for_booking" on public.businesses
        for select using (true)
    $p$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'services'
      and policyname = 'public_read_services_for_booking'
  ) then
    execute $p$
      create policy "public_read_services_for_booking" on public.services
        for select using (is_active = true)
    $p$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'employees'
      and policyname = 'public_read_employees_for_booking'
  ) then
    execute $p$
      create policy "public_read_employees_for_booking" on public.employees
        for select using (is_active = true)
    $p$;
  end if;
end;
$$;

-- ─── RPC: занятые слоты (security definer = обходит RLS) ─────────────────────
-- Возвращает только starts_at/ends_at занятых записей — никаких личных данных.
-- Учитывает часовой пояс бизнеса при сравнении даты.
create or replace function public.get_booked_slots(
  p_business_id uuid,
  p_date        date
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select a.starts_at, a.ends_at
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  where a.business_id = p_business_id
    and (a.starts_at at time zone coalesce(b.timezone, 'UTC'))::date = p_date
    and a.status not in ('cancelled', 'no_show')
$$;

-- ─── Дефолтное расписание для уже существующих бизнесов ──────────────────────
insert into public.business_hours (business_id, day_of_week, is_open, open_time, close_time)
select
  b.id,
  d.dow,
  case when d.dow in (0, 6) then false else true end as is_open,
  '09:00' as open_time,
  '19:00' as close_time
from public.businesses b
cross join (values (0),(1),(2),(3),(4),(5),(6)) as d(dow)
on conflict (business_id, day_of_week) do nothing;


-- ================================================================
-- 010_whatsapp_number.sql
-- ================================================================

-- Migration 010: Add whatsapp_number column to clients
-- Each client can have a WhatsApp phone number for direct client notifications

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

COMMENT ON COLUMN clients.whatsapp_number IS
  'WhatsApp phone in E.164 format (with or without leading +). Used for Meta Cloud API notifications.';


-- ================================================================
-- 011_drop_viber_id.sql
-- ================================================================

-- Миграция 011: Удаление устаревшей колонки viber_id
--
-- В начальной схеме (001) была создана колонка clients.viber_id.
-- В миграции 006 была добавлена clients.viber_user_id — именно она используется в коде.
-- Колонка viber_id нигде не используется и создаёт путаницу.

alter table public.clients
  drop column if exists viber_id;


-- ================================================================
-- 012_business_owner_whatsapp.sql
-- ================================================================

-- Миграция 012: WhatsApp номер владельца бизнеса
--
-- Добавляем поле owner_whatsapp в таблицу businesses.
-- Это WhatsApp-номер владельца для получения алертов (например, мало товара на складе).
-- Отличается от whatsapp_number клиентов — это личный номер владельца, не публичный номер бизнеса.
-- Формат: международный с + (например, +79001234567).

alter table public.businesses
  add column if not exists owner_whatsapp text;


-- ================================================================
-- 013_onboarding_completed.sql
-- ================================================================

-- Миграция 013: флаг завершения онбординга
--
-- onboarding_completed = true означает, что пользователь прошёл wizard при первом входе.
-- Используется для редиректа: новые пользователи → /onboarding, вернувшиеся → /dashboard.

alter table public.businesses
  add column if not exists onboarding_completed boolean not null default false;


-- ================================================================
-- 014_get_booked_slots_employee.sql
-- ================================================================

-- Миграция 014: фильтрация занятых слотов по сотруднику
--
-- Добавляет опциональный параметр p_employee_id в get_booked_slots().
-- Когда параметр передан — возвращаются только слоты конкретного сотрудника,
-- что позволяет публичной странице бронирования показывать независимое
-- расписание каждого специалиста.
-- Когда NULL — прежнее поведение (все слоты бизнеса).

create or replace function public.get_booked_slots(
  p_business_id uuid,
  p_date        date,
  p_employee_id uuid default null
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select a.starts_at, a.ends_at
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  where a.business_id = p_business_id
    and (a.starts_at at time zone coalesce(b.timezone, 'UTC'))::date = p_date
    and a.status not in ('cancelled', 'no_show')
    and (p_employee_id is null or a.employee_id = p_employee_id)
$$;


-- ================================================================
-- 015_email_provider.sql
-- ================================================================

-- Миграция 015: настройки email-провайдера per-бизнес
--
-- Хранит параметры отправки email прямо в БД, чтобы владелец мог
-- настроить SMTP или Resend из интерфейса без правки .env.
-- Поддерживаемые провайдеры: 'smtp', 'resend'.

alter table public.businesses
  add column if not exists email_provider  text,          -- 'smtp' | 'resend' | null
  add column if not exists smtp_host       text,
  add column if not exists smtp_port       integer default 587,
  add column if not exists smtp_user       text,
  add column if not exists smtp_pass       text,
  add column if not exists smtp_from       text,
  add column if not exists resend_api_key  text;


-- ================================================================
-- 016_revoke_sensitive_columns_from_anon.sql
-- ================================================================

-- Remove the overly permissive public read policy on businesses.
-- The booking page (app/book/[slug]) is a Next.js server component that now uses
-- the service role client to fetch business data server-side — no anon access needed.
-- This closes the full-table read exposure including smtp_pass, resend_api_key, bot tokens, etc.

DROP POLICY IF EXISTS "public_read_businesses_for_booking" ON public.businesses;


-- ================================================================
-- 017_prevent_double_booking.sql
-- ================================================================

-- Migration 017: Prevent double-booking at the database level
--
-- Uses a BEFORE INSERT OR UPDATE trigger instead of a partial unique index
-- because the conflict rule is conditional: uniqueness is only enforced
-- when a specific employee is assigned (employee_id IS NOT NULL).
--
-- When employee_id IS NULL the booking is not employee-bound, so multiple
-- simultaneous bookings are allowed — this covers cafes, fitness classes,
-- walk-in counters, and any business that doesn't track per-employee slots.
--
-- The trigger raises a named exception ('slot_already_booked') that the
-- application layer catches and converts to a user-facing error message.

CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enforce uniqueness when a specific employee is assigned.
  -- If employee_id is NULL, the slot is not employee-bound
  -- and multiple bookings at the same time are allowed
  -- (e.g. cafes, fitness classes, walk-in businesses).
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   appointments
    WHERE  business_id  = NEW.business_id
      AND  employee_id  = NEW.employee_id
      AND  starts_at    = NEW.starts_at
      AND  status      != 'cancelled'
      AND  id          != NEW.id
  ) THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop first so re-running the migration is safe
DROP TRIGGER IF EXISTS prevent_double_booking ON appointments;

CREATE TRIGGER prevent_double_booking
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_slot_availability();


-- ================================================================
-- 018_unique_sku.sql
-- ================================================================

-- Prevent duplicate SKUs within the same business.
-- NULLs and empty strings are excluded so optional SKU fields stay flexible.
-- Partial unique constraints require CREATE UNIQUE INDEX (not ALTER TABLE ADD CONSTRAINT).
CREATE UNIQUE INDEX unique_sku_per_business
  ON inventory_items (business_id, sku)
  WHERE sku IS NOT NULL AND sku != '';


-- ================================================================
-- 019_fix_overlap_check.sql
-- ================================================================

-- Migration 019: Group booking capacity + interval overlap fix
--
-- 1. Adds `capacity` column to services (default 1 = individual, >1 = group class)
-- 2. Fixes the double-booking trigger to use interval overlap (not exact start time)
-- 3. Allows multiple bookings up to the service capacity for the same slot

-- ── 1. Capacity column ────────────────────────────────────────────────────────
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1
  CONSTRAINT capacity_positive CHECK (capacity >= 1);

-- ── 2. Updated trigger function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER AS $$
DECLARE
  v_capacity integer;
  v_count    integer;
BEGIN
  -- Only enforce when a specific employee is assigned.
  -- NULL employee_id = walk-ins / unassigned → allow freely.
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the capacity of the booked service (defaults to 1 if not set)
  SELECT COALESCE(capacity, 1) INTO v_capacity
  FROM services
  WHERE id = NEW.service_id;

  -- Count existing non-cancelled appointments for this employee
  -- that overlap with the new booking's time interval
  SELECT COUNT(*) INTO v_count
  FROM appointments
  WHERE business_id = NEW.business_id
    AND employee_id = NEW.employee_id
    AND status      NOT IN ('cancelled', 'no_show')
    AND id          != NEW.id
    AND NEW.starts_at < ends_at
    AND NEW.ends_at   > starts_at;

  -- Block only when the slot is already at capacity
  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from migration 017 — no need to recreate it.
-- The function replacement above takes effect immediately.


-- ================================================================
-- 020_appointment_paid_status.sql
-- ================================================================

-- Migration 020: Add 'paid' to allowed appointment statuses
--
-- Problem: appointments.status has a CHECK constraint that only allows
-- ('pending','confirmed','completed','cancelled','no_show').
-- Setting status = 'paid' from the POS terminal was silently rejected
-- by the database, so appointments stayed 'completed' after checkout.
--
-- Fix: drop the existing status check and recreate it with 'paid' added.

-- Drop any existing CHECK constraint on appointments.status
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.appointments'::regclass
AND contype = 'c'
AND pg_get_constraintdef(oid) LIKE '%status%'
    LOOP
        EXECUTE 'ALTER TABLE public.appointments DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Recreate with 'paid' included
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'paid', 'cancelled', 'no_show'));


-- ================================================================
-- 023_performance_indexes.sql
-- ================================================================

-- Migration 023: Composite indexes for common query patterns
--
-- Audit findings: several high-frequency queries run without covering indexes,
-- forcing Postgres to scan more rows than necessary.
--
-- All indexes are created with IF NOT EXISTS so re-running is safe.

-- ── 1. Transactions: dashboard revenue, CRM history, POS history ──────────────
-- Used in: DashboardPage (revenue today), CRM page (was aggregation query),
--          POS history page.
-- Pattern: WHERE business_id = ? AND status = 'completed' [AND created_at ...]
CREATE INDEX IF NOT EXISTS idx_transactions_business_status_created
  ON public.transactions(business_id, status, created_at DESC);

-- ── 2. Transactions: client stats trigger ────────────────────────────────────
-- Used in: update_client_stats() trigger (migration 008) — fires on every
--          completed POS sale to recompute total_visits/total_spent.
-- Pattern: WHERE client_id = ? AND status = 'completed'
CREATE INDEX IF NOT EXISTS idx_transactions_client_status
  ON public.transactions(client_id, status);

-- ── 3. Clients: reactivation cron query ──────────────────────────────────────
-- Used in: /api/cron/notify — re-activation window (clients last seen 30 days ago).
-- Partial index: only rows where last_visit_at IS NOT NULL (skips new clients).
-- Pattern: WHERE business_id = ? AND last_visit_at BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_clients_last_visit
  ON public.clients(business_id, last_visit_at)
  WHERE last_visit_at IS NOT NULL;

-- ── 4. Appointments: SoftLimitBanner + dashboard ─────────────────────────────
-- Used in: layout (monthly booking count for free plan), dashboard (today count),
--          SoftLimitBanner (monthly booking count).
-- Pattern: WHERE business_id = ? AND status IN (...) AND starts_at BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_appointments_business_status_starts
  ON public.appointments(business_id, status, starts_at);


-- ================================================================
-- 024_brand_color.sql
-- ================================================================

-- Brand color per tenant: used on the public booking page
-- to match the business's visual identity.
alter table public.businesses
  add column if not exists brand_color text default '#2D2926';


-- ================================================================
-- 025_client_phone_unique.sql
-- ================================================================

-- Add unique constraint on (business_id, phone) to support CSV import
-- with ON CONFLICT (business_id, phone) DO NOTHING dedup logic.
-- Only applies when phone is NOT NULL — partial unique index style kept
-- via standard UNIQUE constraint (NULLs are always distinct in Postgres).

ALTER TABLE public.clients
  ADD CONSTRAINT clients_business_phone_unique UNIQUE (business_id, phone);


-- ================================================================
-- 026_enabled_modules.sql
-- ================================================================

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] NOT NULL
DEFAULT ARRAY['bookings','pos','crm','inventory','notifications'];

GRANT ALL ON TABLE public.businesses TO anon, authenticated;


-- ================================================================
-- 027_retail_barcode.sql
-- ================================================================

ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS barcode TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_business_barcode_idx
ON inventory_items (business_id, barcode)
WHERE barcode IS NOT NULL;

GRANT ALL ON TABLE public.inventory_items TO anon, authenticated;


-- ================================================================
-- 028_atendepro_runtime_columns.sql
-- ================================================================

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


-- ================================================================
-- 028_search_tx_items_fn.sql
-- ================================================================

-- Function to search transactions by item name (JSONB array search)
-- Used by POS transaction history to filter by product/service name

CREATE OR REPLACE FUNCTION get_tx_ids_by_item_name(
  p_business_id uuid,
  p_query text
) RETURNS TABLE(id uuid) AS $$
  SELECT t.id
  FROM transactions t
  WHERE t.business_id = p_business_id
    AND t.status = 'completed'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(t.items) AS elem
      WHERE elem->>'name' ILIKE '%' || p_query || '%'
    )
$$ LANGUAGE sql SECURITY DEFINER;


-- ================================================================
-- 029_evolution_per_business.sql
-- ================================================================

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


-- ================================================================
-- 030_evolution_message_templates.sql
-- ================================================================

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


-- ================================================================
-- 031_business_owner_notifications.sql
-- ================================================================

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



-- Padrões brasileiros do AtendePRO
ALTER TABLE public.businesses
  ALTER COLUMN timezone SET DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.businesses
  ALTER COLUMN currency SET DEFAULT 'BRL';

-- Bucket público para fotos dos produtos
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'inventory',
  'inventory',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

-- Verificação rápida: deve listar as tabelas principais
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'businesses',
    'employees',
    'services',
    'clients',
    'appointments',
    'transactions',
    'inventory_items',
    'inventory_movements',
    'notification_log',
    'business_hours'
  )
ORDER BY table_name;
