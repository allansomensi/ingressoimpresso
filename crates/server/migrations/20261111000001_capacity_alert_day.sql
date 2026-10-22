-- The day of a several-day event the capacity warnings were sent for (ADR 0118): each day fills
-- on its own, so its warnings start over. Null on a single-day event.
alter table events add column capacity_alerted_day smallint;
