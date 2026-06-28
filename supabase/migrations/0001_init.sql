-- Retsy V1 schema
-- Run with: supabase db push  (or paste into the Supabase SQL editor)

-- ─────────────────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  -- V1 has no passwords/sessions. This token is mailed to the user as part
  -- of their dashboard link (?email=...&token=...) and lets the dashboard
  -- and update-status functions verify "this really is that user" without
  -- a login flow.
  dashboard_token uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_users_email on users (lower(email));
create unique index if not exists idx_users_dashboard_token on users (dashboard_token);

-- ─────────────────────────────────────────────────────────────────────────
-- purchases
-- ─────────────────────────────────────────────────────────────────────────
create type purchase_status as enum ('pending', 'confirmed', 'returned', 'kept');

create table if not exists purchases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users (id) on delete cascade,
  retailer         text not null,
  item_name        text not null,
  order_date       date,
  order_number     text,
  return_deadline  date not null,
  confidence       numeric(3,2) not null default 0.5, -- 0.00 - 1.00
  status           purchase_status not null default 'pending',
  raw_email_text   text,                 -- original forwarded email body, kept for re-extraction / debugging
  confirm_token    uuid not null default gen_random_uuid(), -- used in the confirmation email link, no-login-required
  created_at       timestamptz not null default now()
);

create index if not exists idx_purchases_user_id on purchases (user_id);
create index if not exists idx_purchases_status on purchases (status);
create index if not exists idx_purchases_deadline on purchases (return_deadline);
create unique index if not exists idx_purchases_confirm_token on purchases (confirm_token);

-- ─────────────────────────────────────────────────────────────────────────
-- reminders
-- ─────────────────────────────────────────────────────────────────────────
create type reminder_type as enum ('7_day', '3_day', '1_day');

create table if not exists reminders (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references purchases (id) on delete cascade,
  send_at        timestamptz not null,
  reminder_type  reminder_type not null,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (purchase_id, reminder_type)
);

create index if not exists idx_reminders_send_at on reminders (send_at) where sent_at is null;
create index if not exists idx_reminders_purchase_id on reminders (purchase_id);

-- ─────────────────────────────────────────────────────────────────────────
-- retailer_policies — simple lookup table, editable without a deploy
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists retailer_policies (
  retailer      text primary key,   -- normalized lowercase retailer name
  window_days   int not null,
  notes         text
);

insert into retailer_policies (retailer, window_days, notes) values
  ('amazon', 30, 'Standard Amazon return window'),
  ('zara',   30, 'Standard Zara return window'),
  ('target', 90, 'Standard Target return window')
on conflict (retailer) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- row level security
-- ─────────────────────────────────────────────────────────────────────────
alter table users enable row level security;
alter table purchases enable row level security;
alter table reminders enable row level security;
alter table retailer_policies enable row level security;

-- V1 has no end-user auth (confirmation/dashboard pages use a signed token
-- in the URL, not Supabase Auth sessions). All reads/writes from the
-- browser go through Edge Functions using the service role key, so we
-- deny anonymous access at the table level and let the functions bypass
-- RLS with the service role.
create policy "service role only - users" on users
  for all using (false) with check (false);
create policy "service role only - purchases" on purchases
  for all using (false) with check (false);
create policy "service role only - reminders" on reminders
  for all using (false) with check (false);
create policy "retailer policies are readable" on retailer_policies
  for select using (true);
