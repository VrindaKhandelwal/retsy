-- Retsy usage metrics — paste any block into the Supabase SQL editor:
-- https://supabase.com/dashboard/project/dssuazxmyjwztqvuyeyb/sql/new
-- (Not a migration; this file is a query cookbook.)

-- ── 1. Signups per day (last 30 days) ────────────────────────────────────
select created_at::date as day, count(*) as signups
from users
where created_at > now() - interval '30 days'
group by 1 order by 1 desc;

-- ── 2. Users by channel: Gmail-connected vs forward-only ────────────────
select
  count(*)                                   as total_users,
  count(g.user_id)                           as gmail_connected,
  count(*) - count(g.user_id)                as forward_only,
  count(*) filter (where g.status = 'revoked') as needs_reconnect
from users u
left join gmail_accounts g on g.user_id = u.id;

-- ── 3. Purchases tracked per user, by source ─────────────────────────────
select u.email,
       count(*)                                    as purchases,
       count(*) filter (where p.source = 'gmail')  as via_gmail,
       count(*) filter (where p.source = 'forwarded') as forwarded,
       max(p.created_at)::date                     as last_tracked
from purchases p join users u on u.id = p.user_id
group by u.email order by purchases desc;

-- ── 4. Decision activity: are people actually using the states? ─────────
select
  count(*) filter (where status in ('pending','confirmed')
                   and return_deadline >= current_date) as deciding,
  count(*) filter (where status = 'to_return')          as to_return,
  count(*) filter (where status = 'returned')           as returned,
  count(*) filter (where status = 'kept')               as kept,
  count(*) filter (where status in ('pending','confirmed','to_return')
                   and return_deadline < current_date)  as missed
from purchases;

-- ── 5. Money: tracked total and saved via returns (dollar totals only) ──
select
  sum((regexp_replace(order_total, '[^0-9.]', '', 'g'))::numeric)
    filter (where order_total like '$%')                          as total_tracked,
  sum((regexp_replace(order_total, '[^0-9.]', '', 'g'))::numeric)
    filter (where order_total like '$%' and status = 'returned')  as saved_via_returns
from purchases;

-- ── 6. Reminders: sent last 7 days + due next 7 days ────────────────────
select
  count(*) filter (where sent_at > now() - interval '7 days') as sent_last_7d,
  count(*) filter (where sent_at is null
                   and send_at between now() and now() + interval '7 days') as due_next_7d
from reminders;

-- ── 7. Dashboard opens per user (last 14 days) ───────────────────────────
select u.email,
       count(*)                        as opens,
       count(distinct v.visited_at::date) as active_days,
       max(v.visited_at)               as last_open
from dashboard_visits v join users u on u.id = v.user_id
where v.visited_at > now() - interval '14 days'
group by u.email order by opens desc;

-- ── 8. Engagement funnel: signed up → connected/forwarded → decided ─────
select
  (select count(*) from users)                                   as signed_up,
  (select count(distinct user_id) from gmail_accounts)           as connected_gmail,
  (select count(distinct user_id) from purchases)                as has_purchases,
  (select count(distinct user_id) from purchases
    where status in ('to_return','returned','kept'))             as made_a_decision,
  (select count(distinct user_id) from dashboard_visits
    where visited_at > now() - interval '7 days')                as opened_dash_last_7d;

-- ── 9. Did reminder emails drive visits? (visit within 24h of a send) ───
select r.sent_at::date as reminder_day, u.email,
       min(v.visited_at) as first_visit_after
from reminders r
join purchases p on p.id = r.purchase_id
join users u on u.id = p.user_id
left join dashboard_visits v
  on v.user_id = u.id
 and v.visited_at between r.sent_at and r.sent_at + interval '24 hours'
where r.sent_at > now() - interval '30 days'
group by 1, 2, r.sent_at order by r.sent_at desc;
