-- Sellers send digital tickets from their own link (ADR 0061): a link is created either by a
-- person on the panel (created_by) or by a seller on the seller's page (seller_id).
alter table ticket_links alter column created_by drop not null;
alter table ticket_links add column seller_id uuid references sellers on delete set null;

-- On by default: the seller already holds the paper ticket, and the link carries the same QR.
alter table events add column sellers_send_tickets boolean not null default true;

-- Replacements of a lost ticket (ADR 0061): the old number is voided and a free number is sent
-- as a digital ticket to the same person, in one step.
create table ticket_replacements (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    old_number integer not null check (old_number >= 1),
    new_number integer not null check (new_number >= 1),
    void_id uuid not null references ticket_voids on delete cascade,
    link_id uuid not null references ticket_links on delete cascade,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    check (new_number <> old_number)
);
create index ticket_replacements_event_idx on ticket_replacements (event_id, created_at desc);
create index ticket_replacements_void_idx on ticket_replacements (void_id);
