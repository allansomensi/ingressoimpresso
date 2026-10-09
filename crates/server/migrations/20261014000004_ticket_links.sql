-- ADR 0030: digital tickets. A link shows a ticket's signed QR on the holder's phone. Only
-- sha256(token) finds the row; the token (so the organizer can copy the link again) and the QR
-- text are sealed under the master key, bound to the row id.
create table ticket_links (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    holder_name text check (holder_name is null or char_length(holder_name) between 1 and 80),
    token_hash bytea not null unique check (length(token_hash) = 32),
    sealed bytea not null,
    created_by uuid not null references users,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    first_opened_at timestamptz,
    last_opened_at timestamptz,
    open_count integer not null default 0 check (open_count >= 0)
);
-- One active link per ticket.
create unique index ticket_links_one_active on ticket_links (event_id, ticket_number) where revoked_at is null;
create index ticket_links_event_idx on ticket_links (event_id, created_at desc);
