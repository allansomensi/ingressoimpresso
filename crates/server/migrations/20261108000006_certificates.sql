-- ADR 0113: certificates of participation. The organizer edits the words once per event; every
-- person who came (a guest of the list who arrived, or a named ticket that entered) gets a PDF and
-- a private link. The link's token is made from the certificate's id and the master key, so it is
-- never stored and can always be shown again.

create table certificate_settings (
    event_id uuid primary key references events on delete cascade,
    title text not null check (char_length(title) between 1 and 60),
    body text not null check (char_length(body) between 1 and 600),
    workload text check (workload is null or char_length(workload) between 1 and 30),
    signer1_name text check (signer1_name is null or char_length(signer1_name) between 1 and 60),
    signer1_role text check (signer1_role is null or char_length(signer1_role) between 1 and 60),
    signer2_name text check (signer2_name is null or char_length(signer2_name) between 1 and 60),
    signer2_role text check (signer2_role is null or char_length(signer2_role) between 1 and 60),
    color text not null check (color ~ '^#[0-9a-f]{6}$'),
    updated_at timestamptz not null default now()
);

create table certificates (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    -- The printed code (CERT-0007), per event.
    number integer not null check (number >= 1),
    name text not null check (char_length(name) between 1 and 80),
    -- Who it is: a guest of the list or a ticket's number (one of them).
    guest_id uuid references guest_list on delete set null,
    ticket_number integer check (ticket_number is null or ticket_number >= 1),
    created_at timestamptz not null default now(),
    first_opened_at timestamptz,
    open_count integer not null default 0 check (open_count >= 0),
    unique (event_id, number)
);
create unique index certificates_guest_idx on certificates (event_id, guest_id) where guest_id is not null;
create unique index certificates_ticket_idx on certificates (event_id, ticket_number) where ticket_number is not null;
