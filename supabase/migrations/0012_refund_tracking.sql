-- Refund tracking for returned purchases:
--   pending  = marked returned, money not seen yet
--   received = a refund email was detected (or confirmed otherwise)
-- refund_amount is stored as printed in the email (e.g. "$47.84").
alter table purchases
  add column if not exists refund_status text
    check (refund_status in ('pending', 'received')),
  add column if not exists refund_amount text;
