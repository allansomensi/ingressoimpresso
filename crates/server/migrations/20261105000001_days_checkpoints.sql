-- ADRs 0089–0092: an instruction at the door per category, events of several days, checkpoints
-- (dinner, kit, open bar). Every new column has a default: phones on the previous app keep working.

-- What the doorkeeper hands over or checks when a ticket of the category enters (ADR 0089).
alter table ticket_categories
    add column door_instruction text
        check (door_instruction is null or char_length(door_instruction) between 1 and 60);

-- Days of an event (ADR 0091). No rows: an event of one day, as always. With days, the event's
-- start is the first day's and its end the last day's (kept by the API).
create table event_days (
    event_id uuid not null references events on delete cascade,
    position smallint not null check (position between 1 and 31),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    primary key (event_id, position),
    check (ends_at > starts_at and ends_at <= starts_at + interval '48 hours')
);

-- When a category's tickets are valid: every day (one entry a day), only on some days (one entry
-- on each of them) or on one day of the holder's choice (one entry in the whole event).
alter table ticket_categories
    add column day_rule text not null default 'every' check (day_rule in ('every', 'days', 'any_one')),
    add column valid_days smallint[] not null default '{}';
alter table ticket_categories add constraint ticket_categories_valid_days_check
    check ((day_rule = 'days') = (cardinality(valid_days) > 0));

-- Checkpoints (ADR 0092): the same QR read again where something extra is handed over. Their
-- uses never count as entries.
create table event_checkpoints (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    name text not null check (char_length(name) between 1 and 30),
    instruction text check (instruction is null or char_length(instruction) between 1 and 60),
    -- One use per day the ticket is valid (true), or one use in the whole event.
    per_day boolean not null default true,
    position smallint not null default 0,
    created_at timestamptz not null default now(),
    unique (event_id, name)
);
create index event_checkpoints_event_idx on event_checkpoints (event_id, position);

-- Categories entitled to a checkpoint; none: every ticket.
create table checkpoint_categories (
    checkpoint_id uuid not null references event_checkpoints on delete cascade,
    category_id uuid not null references ticket_categories on delete cascade,
    primary key (checkpoint_id, category_id)
);
create index checkpoint_categories_category_idx on checkpoint_categories (category_id);

-- A door link opens the entrance (null) or one checkpoint. Deleting the checkpoint deletes its
-- links, their phones and their scans.
alter table door_accesses
    add column checkpoint_id uuid references event_checkpoints on delete cascade;
create index door_accesses_checkpoint_idx on door_accesses (checkpoint_id) where checkpoint_id is not null;

-- Scans: the checkpoint comes from the phone's link, never from the app. `day` is the event day
-- the phone was on; `ledger_day` the book it was deduplicated in (null: the whole event).
alter table scans
    add column checkpoint_id uuid references event_checkpoints on delete cascade,
    add column day smallint check (day is null or day between 1 and 31),
    add column ledger_day smallint check (ledger_day is null or ledger_day between 1 and 31),
    add column exception_kind text
        check (exception_kind is null or exception_kind in ('wrong_door', 'wrong_day', 'not_entitled'));
alter table scans add constraint scans_ledger_matches_day_check
    check (ledger_day is null or ledger_day = day);
alter table scans add constraint scans_exception_needs_flag_check
    check (exception_kind is null or door_exception);

alter table scans drop constraint scans_local_outcome_check;
alter table scans add constraint scans_local_outcome_check check (local_outcome in
    ('admitted', 'rejected_used', 'rejected_void', 'rejected_invalid', 'rejected_other_event',
     'rejected_wrong_door', 'readmitted', 'exited', 'rejected_already_out',
     'rejected_wrong_day', 'benefit_granted', 'rejected_benefit_used', 'rejected_not_entitled'));
-- Entrance outcomes only at the entrance, checkpoint outcomes only at a checkpoint.
alter table scans add constraint scans_outcome_place_check check (
    case when checkpoint_id is null
         then local_outcome not in ('benefit_granted', 'rejected_benefit_used', 'rejected_not_entitled')
         else local_outcome not in ('admitted', 'readmitted', 'exited', 'rejected_used',
                                    'rejected_already_out', 'rejected_wrong_door')
    end);

alter table scans drop constraint scans_entry_class_check;
alter table scans add constraint scans_entry_class_check
    check ((local_outcome in ('admitted', 'readmitted', 'benefit_granted')) = (server_class is not null));
alter table scans drop constraint scans_movement_number_check;
alter table scans add constraint scans_movement_number_check
    check (local_outcome not in ('admitted', 'readmitted', 'exited', 'rejected_already_out',
                                 'rejected_wrong_door', 'rejected_wrong_day', 'benefit_granted',
                                 'rejected_benefit_used', 'rejected_not_entitled')
           or ticket_number is not null);
alter table scans drop constraint scans_door_exception_check;
alter table scans add constraint scans_door_exception_check
    check (not door_exception or local_outcome in ('admitted', 'readmitted', 'benefit_granted'));

create index scans_checkpoint_idx on scans (checkpoint_id) where checkpoint_id is not null;
create index scans_ledger_idx on scans (event_id, ticket_number, ledger_day, scanned_at)
    where local_outcome in ('admitted', 'readmitted', 'exited', 'benefit_granted');

-- The per-book lock of the online confirmation (ADR 0091): one row per ticket and book (the
-- entrance or a checkpoint, a day or the whole event). `entries` stays "the ticket entered the
-- event", which reports, the box office and the second copy rely on.
create table door_ledger_entries (
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    -- The nil UUID is the entrance; 0 is the whole event.
    checkpoint uuid not null default '00000000-0000-0000-0000-000000000000',
    ledger_day smallint not null default 0,
    first_scan_id uuid not null references scans on delete cascade deferrable initially deferred,
    primary key (event_id, ticket_number, checkpoint, ledger_day)
);
insert into door_ledger_entries (event_id, ticket_number, first_scan_id)
select event_id, ticket_number, first_scan_id from entries;
