-- Real name from the Google id_token (profile scope), captured when the
-- user connects Gmail. Null for forward-only users; the dashboard falls
-- back to an email-derived guess.
alter table users
  add column if not exists full_name text;
