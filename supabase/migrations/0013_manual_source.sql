-- Purchases can now be added by hand from the dashboard.
alter table purchases drop constraint if exists purchases_source_check;
alter table purchases add constraint purchases_source_check
  check (source in ('forwarded', 'gmail', 'manual'));
