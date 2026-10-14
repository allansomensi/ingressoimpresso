-- Lookups of an event's batches by status (reports, checklist, the admin's figures) had only the
-- GiST exclusion index to lean on; a plain btree is what they need.
create index if not exists ticket_batches_event_status_idx on ticket_batches (event_id, status);
