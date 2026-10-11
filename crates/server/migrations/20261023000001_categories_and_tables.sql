-- ADR 0056: ticket categories (inteira, meia, VIP, cortesia) by number ranges, printed on a
-- coloured band; their price replaces the event's in the settlement.
create table ticket_categories (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    name text not null check (char_length(name) between 1 and 30),
    color text not null check (color ~ '^#[0-9a-f]{6}$'),
    -- Null: the event's price. Zero: courtesy.
    price_cents integer check (price_cents is null or price_cents between 0 and 100000000),
    position smallint not null default 0,
    created_at timestamptz not null default now(),
    unique (event_id, name)
);
create index ticket_categories_event_idx on ticket_categories (event_id, position);

create table category_ranges (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    category_id uuid not null references ticket_categories on delete cascade,
    numbers int4range not null check (lower(numbers) >= 1 and not isempty(numbers)),
    created_at timestamptz not null default now(),
    -- A number belongs to one category at most.
    exclude using gist (event_id with =, numbers with &&)
);
create index category_ranges_category_idx on category_ranges (category_id);

-- ADR 0057: tables and seats (bailes, jantares, formaturas). Positions are fractions (0–1) of
-- the map, so the map scales with the screen.
create table event_tables (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    name text not null check (char_length(name) between 1 and 30),
    seats smallint not null check (seats between 1 and 50),
    shape text not null default 'round' check (shape in ('round', 'rect')),
    x real not null default 0.5 check (x between 0 and 1),
    y real not null default 0.5 check (y between 0 and 1),
    created_at timestamptz not null default now(),
    unique (event_id, name)
);
create index event_tables_event_idx on event_tables (event_id);

-- The seat of a ticket: one per number, one number per seat.
create table ticket_seats (
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    table_id uuid not null references event_tables on delete cascade,
    seat smallint not null check (seat between 1 and 50),
    primary key (event_id, ticket_number),
    unique (table_id, seat)
);
