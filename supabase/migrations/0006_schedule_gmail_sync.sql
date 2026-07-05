-- Schedules the gmail-sync Edge Function to run once daily using
-- pg_cron + pg_net. Run this AFTER deploying the gmail-sync function.
--
-- Replace:
--   <PROJECT_REF>   with your Supabase project ref (e.g. abcdefghijklmno)
--   <CRON_SECRET>   with the same value you set for the CRON_SECRET env var
--                   on the gmail-sync function (shared with send-reminders)
--
-- Extensions already enabled by 0002_schedule_reminders.sql.

select cron.schedule(
  'retsy-gmail-sync',
  '0 13 * * *', -- daily at 13:00 UTC (morning in the US)
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/gmail-sync',
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
--   select cron.unschedule('retsy-gmail-sync');
