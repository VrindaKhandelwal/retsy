-- Whether gmail-sync still has unprocessed messages in the account's
-- window (true during the initial 30-day backfill, false once drained).
-- The dashboard shows a "still syncing" banner + auto-refresh while set.
alter table gmail_accounts
  add column if not exists sync_backlog boolean not null default false;
