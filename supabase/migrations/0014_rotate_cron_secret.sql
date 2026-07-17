-- Reschedules both cron jobs with a rotated CRON_SECRET. Placeholders are
-- filled at apply time (same convention as 0002/0006); the applied version
-- on the hosted project carries the real values.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'retsy-send-reminders') then
    perform cron.unschedule('retsy-send-reminders');
  end if;
  if exists (select 1 from cron.job where jobname = 'retsy-gmail-sync') then
    perform cron.unschedule('retsy-gmail-sync');
  end if;
end $$;

select cron.schedule('retsy-send-reminders', '*/30 * * * *',
  $$ select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb); $$);

select cron.schedule('retsy-gmail-sync', '0 13 * * *',
  $$ select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/gmail-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb); $$);
