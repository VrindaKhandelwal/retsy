-- Tables created via migration files (rather than the SQL editor) don't
-- get Supabase's automatic role grants, so service_role had no privileges
-- on them at all — RLS policies allow it to bypass row checks, but GRANT
-- is a separate, lower-level permission that still has to be set.
grant select, insert, update, delete on users to service_role;
grant select, insert, update, delete on purchases to service_role;
grant select, insert, update, delete on reminders to service_role;
grant select, insert, update, delete on retailer_policies to service_role;
