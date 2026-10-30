-- ADR 0124: a waiting list on the event's public page, for sold-out categories.
alter table events add column public_waitlist boolean not null default true;

create table waitlist_entries (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    -- The sold-out category asked for; null: the event as a whole.
    category_id uuid references ticket_categories on delete set null,
    name text not null check (char_length(name) between 1 and 80),
    -- Digits with the country code, as the organization's WhatsApp (normalize_whatsapp).
    phone text not null check (phone ~ '^[0-9]{10,15}$'),
    quantity smallint not null default 1 check (quantity between 1 and 10),
    created_at timestamptz not null default now(),
    -- When the organization took care of it (a ticket sent, or a message).
    done_at timestamptz
);
-- One line per person and category: signing up again updates it.
create unique index waitlist_entries_person
    on waitlist_entries (event_id, phone, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index waitlist_entries_event on waitlist_entries (event_id, created_at);
