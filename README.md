# Retsy

Forward a receipt, never miss the return window. V1.

Forward order/receipt emails to `returns@retsy.xyz`. Retsy extracts the
retailer, item, order date, and order number with OpenAI, estimates a return
deadline from a retailer-policy table, asks you to confirm it by email, and
then emails you reminders 7, 3, and 1 day before the deadline.

## How it's built

```
Browser (Next.js)
   │  fetch()
   ▼
Supabase Edge Functions  ───────────────►  OpenAI (extraction)
   │            │            │
   │            │            └────────►  Resend (outbound email)
   ▼            ▼
Postgres    pg_cron (every 30 min, triggers send-reminders)
   ▲
   │  inbound webhook
Postmark  ◄── user forwards email to returns@retsy.xyz
```

- **Frontend** — `app/` (Next.js App Router): landing page, confirmation
  page, dashboard. No auth system — the confirmation page and dashboard are
  reached via tokenized links mailed to the user (see "How auth works"
  below).
- **Backend** — `supabase/functions/` (Deno Edge Functions):
  - `inbound-email` — Postmark webhook target. Parses the forwarded email,
    runs OpenAI extraction, computes a deadline, stores a `pending`
    purchase, emails a confirmation link.
  - `confirm-purchase` — fetch/update a single purchase by id+token; on
    confirm, schedules the three reminder rows.
  - `list-purchases` / `update-status` — power the dashboard (list, mark
    returned/kept, delete).
  - `signup` — landing-page email capture + "resend my dashboard link".
  - `send-reminders` — scheduled job; sends any due, unsent reminder and
    marks it sent.
- **Database** — Supabase Postgres, schema in `supabase/migrations/`.
- **Inbound email** — Postmark inbound webhook.
- **Outbound email** — Resend.
- **AI extraction** — OpenAI (`gpt-4o-mini`, JSON mode).
- **Cron** — `pg_cron` + `pg_net` calling `send-reminders` every 30 minutes.

## How auth works (V1 has none)

There's no login. Two random tokens stand in for it:

- `purchases.confirm_token` — mailed as part of the confirmation link for
  *that one purchase*. Anyone with the link can view/edit/confirm that
  purchase, nothing else.
- `users.dashboard_token` — mailed as part of the dashboard link. Anyone
  with the link can see that user's full purchase list and change statuses.

This is intentionally simple for V1. Before a wider launch you'd want these
tokens to expire, and ideally a real magic-link/session system.

## Local setup

### 1. Supabase project

```bash
supabase init        # if not already a supabase project
supabase start        # local dev stack
supabase db push       # applies supabase/migrations/0001_init.sql
```

For the cron migration (`0002_schedule_reminders.sql`), fill in your project
ref and `CRON_SECRET` before applying it — it's meant for the hosted
project, not local dev (local pg_cron has nothing public to call).

### 2. Edge function secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set APP_URL=https://app.retsy.xyz
supabase secrets set POSTMARK_INBOUND_SECRET=$(openssl rand -hex 16)
supabase secrets set CRON_SECRET=$(openssl rand -hex 16)
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically in
# hosted Edge Functions; for local dev they're printed by `supabase start`.
```

### 3. Deploy functions

```bash
supabase functions deploy inbound-email
supabase functions deploy confirm-purchase
supabase functions deploy list-purchases
supabase functions deploy update-status
supabase functions deploy signup
supabase functions deploy send-reminders
```

### 4. Postmark

1. Add and verify the `retsy.xyz` domain (or a subdomain) in Postmark.
2. Create an Inbound server / stream, with inbound address
   `returns@retsy.xyz`.
3. Set its **Inbound webhook URL** to:
   `https://<project-ref>.supabase.co/functions/v1/inbound-email?secret=<POSTMARK_INBOUND_SECRET>`
4. Set "Email" → "Default reply" sending domain for outbound, or just rely
   on Resend for all outbound (recommended split: Postmark inbound-only,
   Resend outbound-only, as in this V1).

### 5. Resend

1. Verify the sending domain used in `supabase/functions/_shared/resend.ts`
   (`reminders@retsy.xyz`).
2. Add the API key as `RESEND_API_KEY` above.

### 6. Cron

Apply `0002_schedule_reminders.sql` against the hosted project (with the
project ref / secret filled in) to schedule `send-reminders` every 30
minutes via `pg_cron` + `pg_net`.

### 7. Frontend

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL to your deployed functions URL
npm install
npm run dev
```

## Retailer return-window policy

Stored in the `retailer_policies` table (editable directly in SQL/dashboard,
no deploy needed):

| Retailer | Window   |
| -------- | -------- |
| Amazon   | 30 days  |
| Zara     | 30 days  |
| Target   | 90 days  |
| Unknown  | 30 days (flagged for the user to confirm/edit) |

## Out of scope for V1 (by design)

- Gmail OAuth / automatic inbox scanning — forwarding only.
- Mobile app.
- Real authentication/sessions — tokenized email links only.
- Editing the retailer policy table from the UI — SQL only for now.
