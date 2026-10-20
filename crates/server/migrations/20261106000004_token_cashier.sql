-- ADR 0098: the token cashier. A seller of a token event may work as a cashier: they sell on the
-- spot, write down how each sale was paid and close the drawer with the cash they counted.

alter table sellers add column cashier boolean not null default false;

-- A closed shift of a cashier: what the sales of the shift add up to, by how they were paid, and
-- the cash counted in the drawer. The sums are kept as they were when the shift was closed.
create table cashier_closings (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    seller_id uuid not null references sellers on delete cascade,
    tokens integer not null check (tokens >= 0),
    cash_cents bigint not null check (cash_cents >= 0),
    pix_cents bigint not null check (pix_cents >= 0),
    card_cents bigint not null check (card_cents >= 0),
    -- Sales with no payment written down (marked before the seller became a cashier).
    other_cents bigint not null check (other_cents >= 0),
    counted_cents bigint check (counted_cents is null or counted_cents between 0 and 100000000000),
    note text check (note is null or char_length(note) between 1 and 200),
    -- The organizer who closed it on the panel; `null` when the cashier closed it on the link.
    closed_by uuid references users on delete set null,
    closed_at timestamptz not null default now()
);
create index cashier_closings_seller_idx on cashier_closings (seller_id, closed_at desc);

-- How a sale was paid (only what a cashier writes down) and the shift that closed it.
alter table ticket_sales
    add column payment_method text check (payment_method in ('cash', 'pix', 'card')),
    add column closing_id uuid references cashier_closings on delete set null;
create index ticket_sales_open_shift_idx on ticket_sales (seller_id) where closing_id is null;
