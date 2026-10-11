-- ADR 0058: accountability. Expenses and other income of an event, written by the team, so the
-- report shows the whole picture (ticket money, platform cost, expenses, balance) in PDF and
-- spreadsheet for the group (formatura committees, APMs, churches).
create table event_ledger (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    kind text not null check (kind in ('expense', 'income')),
    description text not null check (char_length(description) between 1 and 120),
    -- Free grouping ("Buffet", "Som", "Doação").
    category text check (category is null or char_length(category) between 1 and 40),
    amount_cents integer not null check (amount_cents between 1 and 100000000),
    occurred_on date not null,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now()
);
create index event_ledger_event_idx on event_ledger (event_id, occurred_on);
