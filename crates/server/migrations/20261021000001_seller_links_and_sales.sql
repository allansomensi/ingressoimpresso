-- ADR 0053: a private link per seller, opened on their phone without an account, where they mark
-- the tickets they sold. Like the digital tickets (ADR 0030), only sha256(token) finds the row;
-- the token is sealed under the master key so the organizer can send the same link again.
create table seller_links (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    seller_id uuid not null references sellers on delete cascade,
    token_hash bytea not null unique check (length(token_hash) = 32),
    sealed bytea not null,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    last_opened_at timestamptz
);
-- One active link per seller.
create unique index seller_links_one_active on seller_links (seller_id) where revoked_at is null;

-- Tickets a seller marked as sold, with the buyer if they wrote it down (the control sheet's
-- columns). One mark per number: it is the seller's word, not a payment.
create table ticket_sales (
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    seller_id uuid not null references sellers on delete cascade,
    buyer_name text check (buyer_name is null or char_length(buyer_name) between 1 and 80),
    buyer_phone text check (buyer_phone is null or char_length(buyer_phone) between 1 and 30),
    sold_at timestamptz not null default now(),
    primary key (event_id, ticket_number)
);
create index ticket_sales_seller_idx on ticket_sales (seller_id);
