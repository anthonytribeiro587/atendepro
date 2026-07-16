-- Миграция 007: Автоматический планировщик уведомлений (pg_cron + pg_net)
--
-- Что это делает:
--   Создаёт задачу внутри базы данных Supabase, которая каждые 15 минут
--   автоматически вызывает /api/cron/notify — отправляет напоминания о записях,
--   благодарности после визита, поздравления с днём рождения и т.д.
--
-- ВАЖНО — перед запуском этого файла:
--
--   1. Включите расширение pg_cron в Supabase Dashboard:
--      Database → Extensions → найдите "pg_cron" → включите (Toggle ON)
--
--   2. Убедитесь что расширение pg_net тоже включено:
--      Database → Extensions → "pg_net" → должно быть включено (обычно уже включено)
--
--   3. ЗАМЕНИТЕ два значения-заглушки в этом файле:
--      - YOUR_APP_URL  → ваш реальный домен, например: https://myapp.com
--      - YOUR_CRON_SECRET → значение CRON_SECRET из вашего файла .env
--
--   4. Запустите этот файл в Supabase Dashboard → SQL Editor
--
-- ─────────────────────────────────────────────────────────────────────────────

-- Удаляем задачу если уже существует (чтобы можно было перезапустить миграцию)
select cron.unschedule('atendepro-notify') where exists (
  select 1 from cron.job where jobname = 'atendepro-notify'
);

-- Создаём задачу: каждые 15 минут вызываем /api/cron/notify
-- pg_net.http_get — встроенный в Supabase способ делать HTTP-запросы из базы данных
select cron.schedule(
  'atendepro-notify',        -- имя задачи (уникальное)
  '*/15 * * * *',         -- расписание: каждые 15 минут
  $$
  select net.http_get(
    url     := '${NEXT_PUBLIC_APP_URL}/api/cron/notify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ${CRON_SECRET}'
    )
  ) as request_id;
  $$
);

-- После запуска можно проверить что задача создана:
-- SELECT * FROM cron.job WHERE jobname = 'atendepro-notify';
--
-- Посмотреть историю запусков (последние выполнения):
-- SELECT * FROM cron.job_run_details WHERE jobname = 'atendepro-notify' ORDER BY start_time DESC LIMIT 10;
