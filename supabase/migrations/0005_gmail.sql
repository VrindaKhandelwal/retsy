-- Retsy V2: Gmail integration
--
-- Additive only — V1 code runs unchanged against this schema, so rolling
-- back to V1 is just a redeploy (these tables/columns sit inert).

-- ─────────────────────────────────────────────────────────────────────────
-- gmail_accounts — one linked Gmail inbox per user
-- ─────────────────────────────────────────────────────────────────────────
-- refresh_token is stored plaintext; the table is RLS-deny-all with
-- service-role-only grants, so it's protected at the same trust level as
-- the service key itself. If that ever feels thin, move to Supabase Vault
-- or app-level AES-GCM encryption with a TOKEN_ENC_KEY secret.
create table if not exists gmail_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references users (id) on delete cascade,
  google_email    text not null,
  refresh_token   text not null,
  status          text not null default 'active'
                    check (status in ('active', 'revoked', 'error')),
  -- Watermark cursor for the daily sync: each run queries Gmail with
  -- q=after:<epoch(last_synced_at - 1h)>; the gmail_message_id unique
  -- index below makes the overlap window idempotent.
  last_synced_at  timestamptz,
  last_sync_error text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- gmail_oauth_states — one-time CSRF/state rows for the OAuth flow
-- ─────────────────────────────────────────────────────────────────────────
-- gmail-oauth-start inserts a row and passes its id as the OAuth `state`
-- param; gmail-oauth-callback consumes (deletes) it and rejects anything
-- older than 15 minutes. Keeps the dashboard token out of Google redirect
-- URLs entirely.
create table if not exists gmail_oauth_states (
  state       uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- purchases — track where each purchase came from + Gmail dedupe key
-- ─────────────────────────────────────────────────────────────────────────
-- default 'forwarded' labels every existing V1 row and every future
-- inbound-email insert correctly with zero V1 code changes.
alter table purchases
  add column if not exists source text not null default 'forwarded'
    check (source in ('forwarded', 'gmail')),
  add column if not exists gmail_message_id text;

create unique index if not exists idx_purchases_gmail_msg
  on purchases (user_id, gmail_message_id)
  where gmail_message_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- row level security + service role grants (same pattern as 0001/0003)
-- ─────────────────────────────────────────────────────────────────────────
alter table gmail_accounts enable row level security;
alter table gmail_oauth_states enable row level security;

create policy "service role only - gmail_accounts" on gmail_accounts
  for all using (false) with check (false);
create policy "service role only - gmail_oauth_states" on gmail_oauth_states
  for all using (false) with check (false);

grant select, insert, update, delete on gmail_accounts to service_role;
grant select, insert, update, delete on gmail_oauth_states to service_role;
