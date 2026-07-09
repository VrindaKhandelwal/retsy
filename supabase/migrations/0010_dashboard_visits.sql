-- Dashboard open tracking. Every real dashboard load calls list-purchases,
-- which inserts a row here (the frontend's auto-refresh polling marks
-- itself with ?poll=1 and is not logged). Query patterns in metrics.sql.
create table if not exists dashboard_visits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  visited_at  timestamptz not null default now()
);

create index if not exists idx_dashboard_visits_user_time
  on dashboard_visits (user_id, visited_at desc);

alter table dashboard_visits enable row level security;
create policy "service role only - dashboard_visits" on dashboard_visits
  for all using (false) with check (false);

grant select, insert, update, delete on dashboard_visits to service_role;
