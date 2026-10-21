-- ADR 0112: combos. A checkpoint may hand over more than one item per ticket ("entrada + 2
-- bebidas"): how many is the allowance, for every ticket or per category. Each use is one more
-- slot of the ticket's book, so the door's dedup stays "first wins" inside a slot.

alter table event_checkpoints
    add column allowance smallint not null default 1 check (allowance between 1 and 20);
alter table checkpoint_categories
    add column allowance smallint not null default 1 check (allowance between 1 and 20);

alter table door_ledger_entries
    add column slot smallint not null default 1 check (slot between 1 and 20);
alter table door_ledger_entries drop constraint door_ledger_entries_pkey;
alter table door_ledger_entries
    add primary key (event_id, ticket_number, checkpoint, ledger_day, slot);

-- The slot a use was decided in; null: the first (and the entrance, which has one).
alter table scans add column slot smallint check (slot is null or slot between 2 and 20);
