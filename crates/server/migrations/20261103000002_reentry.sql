-- ADR 0083: exit and return (re-entry). An event may let a ticket that went out come back in.
-- Exits are scans like any other (append-only, idempotent by id): `exited` at the exit,
-- `readmitted` for a return, `rejected_already_out` for the same ticket read twice on the way
-- out. Every phone keeps the latest movement of each ticket; the server classifies a return like
-- a first entry, under the same per-ticket lock (the `entries` row).
alter table events add column reentry boolean not null default false;

alter table scans drop constraint scans_local_outcome_check;
alter table scans add constraint scans_local_outcome_check check (local_outcome in
    ('admitted', 'rejected_used', 'rejected_void', 'rejected_invalid', 'rejected_other_event',
     'rejected_wrong_door', 'readmitted', 'exited', 'rejected_already_out'));

alter table scans drop constraint scans_server_class_check;
alter table scans add constraint scans_server_class_check
    check (server_class in ('first_entry', 'duplicate_entry', 'void_entry', 'reentry'));

-- Entries (first or return) are classified by the server; nothing else is.
alter table scans drop constraint scans_check;
alter table scans add constraint scans_entry_class_check
    check ((local_outcome in ('admitted', 'readmitted')) = (server_class is not null));
alter table scans drop constraint scans_check1;
alter table scans add constraint scans_movement_number_check
    check (local_outcome not in ('admitted', 'readmitted', 'exited', 'rejected_already_out')
           or ticket_number is not null);
-- A return through a door that does not take its category may be let in anyway too (ADR 0068).
alter table scans drop constraint scans_door_exception_check;
alter table scans add constraint scans_door_exception_check
    check (not door_exception or local_outcome in ('admitted', 'readmitted'));

-- Movements of one ticket in time order: the classification of a return and the live count.
create index scans_movements_idx on scans (event_id, ticket_number, scanned_at)
    where local_outcome in ('admitted', 'readmitted', 'exited');
