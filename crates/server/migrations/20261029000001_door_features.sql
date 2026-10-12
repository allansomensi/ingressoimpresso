-- Door features (ADRs 0067–0071): rehearsal, door by category, box office, guest list and the
-- live door view. Every new column has a default: phones on the previous app keep working.

-- Rehearsal (ADR 0067) and what the live view shows of each phone (ADR 0071). `pending_scans`
-- is what the phone reported on its last manifest (null: an app that does not report it).
alter table door_devices
    add column rehearsed_at timestamptz,
    add column last_sync_at timestamptz,
    add column pending_scans integer check (pending_scans is null or pending_scans >= 0);

-- Door by category (ADR 0068): a link with categories admits only them (none: every ticket).
-- A deleted category leaves the link; a link left without categories admits everything again.
create table door_access_categories (
    door_access_id uuid not null references door_accesses on delete cascade,
    category_id uuid not null references ticket_categories on delete cascade,
    primary key (door_access_id, category_id)
);
create index door_access_categories_category_idx on door_access_categories (category_id);

-- A ticket of a category this door does not take is refused without an entry; "let in anyway"
-- admits it with `door_exception`.
alter table scans drop constraint scans_local_outcome_check;
alter table scans add constraint scans_local_outcome_check check (local_outcome in
    ('admitted', 'rejected_used', 'rejected_void', 'rejected_invalid', 'rejected_other_event',
     'rejected_wrong_door'));
alter table scans add column door_exception boolean not null default false;
alter table scans add constraint scans_door_exception_check
    check (not door_exception or local_outcome = 'admitted');

-- Box office (ADR 0069): the seller's numbers are sold at the door; sold = entered.
alter table sellers add column box_office boolean not null default false;

-- Guest list (ADR 0070).
create table guest_list (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    name text not null check (char_length(name) between 1 and 80),
    companions smallint not null default 0 check (companions between 0 and 20),
    note text check (note is null or char_length(note) between 1 and 120),
    category_id uuid references ticket_categories on delete set null,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index guest_list_event_idx on guest_list (event_id, name);

-- Arrivals recorded by door phones: ids are generated on the phone (idempotent uploads), and the
-- same safe cursor as scans spreads them to every phone (ADR 0006). An undo on the phone that
-- recorded it sets `undone_at` and a new `txid`, so phones receive the arrival again.
create table guest_arrivals (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    guest_id uuid not null references guest_list on delete cascade,
    device_id uuid not null references door_devices on delete cascade,
    people smallint not null check (people between 1 and 21),
    arrived_at timestamptz not null,
    undone_at timestamptz,
    received_at timestamptz not null default now(),
    txid xid8 not null default pg_current_xact_id()
);
create index guest_arrivals_event_txid_idx on guest_arrivals (event_id, txid);
create index guest_arrivals_guest_idx on guest_arrivals (guest_id);
create index guest_arrivals_device_idx on guest_arrivals (device_id);
