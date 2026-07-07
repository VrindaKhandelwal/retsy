-- Most retailers count the return window from DELIVERY, not from the order
-- date. When gmail-sync sees a delivery notification it matches the
-- purchase, records delivery_date, and recomputes return_deadline from it
-- (deadline_basis flips to 'delivery_date'). Purchases without a known
-- delivery date keep the order-date-based deadline — earlier than the true
-- one, so reminders err on the safe side.

alter table purchases
  add column if not exists delivery_date date,
  add column if not exists deadline_basis text not null default 'order_date'
    check (deadline_basis in ('order_date', 'delivery_date'));
