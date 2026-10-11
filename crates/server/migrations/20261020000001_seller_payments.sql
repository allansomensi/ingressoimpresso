-- Money each seller handed over (ADR 0050). Tickets are sold outside the platform: these rows are
-- the organizer's notebook, not payments the platform processed. The report compares them with
-- what each seller owes (declared sold × ticket price).
create table seller_payments (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    seller_id uuid not null references sellers on delete cascade,
    amount_cents integer not null check (amount_cents between 1 and 100000000),
    method text not null check (method in ('pix', 'cash', 'other')),
    received_on date not null,
    note text check (note is null or char_length(note) <= 200),
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now()
);
create index seller_payments_seller_idx on seller_payments (seller_id);
create index seller_payments_event_idx on seller_payments (event_id, received_on);
