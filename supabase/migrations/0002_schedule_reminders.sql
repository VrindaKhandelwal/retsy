-- Schedules the send-reminders Edge Function to run every 30 minutes using
-- pg_cron + pg_net. Run this AFTER deploying the send-reminders function.
--
-- Replace:
--   <PROJECT_REF>   with your Supabase project ref (e.g. abcdefghijklmno)
--   <CRON_SECRET>   with the same value you set for the CRON_SECRET env var
--                   on the send-reminders function
--
-- These extensions are enabled by default on Supabase projects; if not,
-- enable them first in Database > Extensions.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'retsy-send-reminders',
  '*/30 * * * *', -- every 30 minutes
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect or remove the schedule later:
--   select * from cron.job;
--   select cron.unschedule('retsy-send-reminders');
