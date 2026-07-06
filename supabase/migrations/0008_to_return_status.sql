-- Purchases carry an explicit user intent now:
--   confirmed  = tracked, user hasn't decided yet ("deciding")
--   to_return  = user wants to return it and hasn't shipped it yet
--   returned   = returned
--   kept       = keeping it
-- "Missed the window" is derived in the UI (deciding/to_return with a past
-- deadline), not stored — it self-corrects if the deadline is edited.
--
-- V1 rollback note: V1 code never writes 'to_return'; rows a V2 user put in
-- that state simply don't render on the V1 dashboard until re-marked.

alter type purchase_status add value if not exists 'to_return';
