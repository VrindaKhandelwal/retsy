-- Two-phase initial scan: the fresh-connect sync covers the last 30 days
-- first (the purchases with live return windows), then backfills the
-- 30-60 day segment recorded here. Both null once the deep pass finishes.
alter table gmail_accounts
  add column if not exists backfill_until timestamptz,
  add column if not exists backfill_before timestamptz;
