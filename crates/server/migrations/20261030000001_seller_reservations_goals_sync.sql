-- Sellers (ADRs 0072–0074): reservations, goals and ranking, and the offline queue of the seller's
-- page. Every new column has a default: pages open on the previous version keep working.

-- Reservations (ADR 0072): a seller holds numbers for a person until a deadline. It is the
-- seller's word, like a sale mark: it never reaches the door nor changes the QR. One row per
-- number; the numbers reserved together share `reservation_id`. A reservation is active while
-- `expires_at > now()`: an expired one frees its numbers without any job, and the hourly cleanup
-- deletes the old ones. `created_by` is the organizer who reserved from the panel (null: the
-- seller's link).
create table ticket_reservations (
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    reservation_id uuid not null,
    seller_id uuid not null references sellers on delete cascade,
    holder_name text not null check (char_length(holder_name) between 1 and 80),
    holder_phone text check (holder_phone is null or char_length(holder_phone) between 1 and 30),
    expires_at timestamptz not null,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    primary key (event_id, ticket_number)
);
create index ticket_reservations_reservation_idx on ticket_reservations (reservation_id);
create index ticket_reservations_seller_idx on ticket_reservations (seller_id);
create index ticket_reservations_expires_idx on ticket_reservations (expires_at);

-- Goals and ranking (ADR 0073): tickets each seller aims to sell, and whether their pages show
-- the ranking (off by default: some groups prefer no competition).
alter table sellers add column goal integer check (goal is null or goal between 1 and 100000);
alter table events add column sellers_ranking boolean not null default false;

-- The offline queue (ADR 0074): each change made on the seller's page has an id created on the
-- phone. The answer to an id is kept, so sending it again (a retry after a lost answer, a phone
-- that reconnects twice) changes nothing and gets the same answer.
create table seller_sync_ops (
    seller_id uuid not null references sellers on delete cascade,
    op_id uuid not null,
    result jsonb not null,
    created_at timestamptz not null default now(),
    primary key (seller_id, op_id)
);
create index seller_sync_ops_created_idx on seller_sync_ops (created_at);
