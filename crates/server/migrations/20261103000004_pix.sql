-- ADR 0085: Pix "copia e cola" paid straight to the organization or to the seller. The platform
-- never moves money: it keeps where the buyer pays and, per number, that someone saw the money.

-- The organization's key (one per organization) and, optionally, each seller's own.
alter table organization_profiles
    add column pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
    add column pix_key text check (char_length(pix_key) between 1 and 77),
    add column pix_name text check (char_length(pix_name) between 1 and 25),
    add column pix_city text check (char_length(pix_city) between 1 and 15),
    add constraint organization_profiles_pix_check
        check (num_nonnulls(pix_key_type, pix_key, pix_name, pix_city) in (0, 4));
alter table sellers
    add column pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
    add column pix_key text check (char_length(pix_key) between 1 and 77),
    add column pix_name text check (char_length(pix_name) between 1 and 25),
    add column pix_city text check (char_length(pix_city) between 1 and 15),
    add constraint sellers_pix_check
        check (num_nonnulls(pix_key_type, pix_key, pix_name, pix_city) in (0, 4));

-- Who the buyers' Pix pays: nobody (off), the organization, or the seller of each number (their
-- key when they have one, else the organization's).
alter table events
    add column pix_receiver text not null default 'off'
        check (pix_receiver in ('off', 'organization', 'seller'));

-- A number whose Pix someone saw arrive: the organization in the panel (its bank statement) or
-- the seller on their page (their own key). Money received by the organization for a seller's
-- number counts in that seller's settlement as money handed over (ADR 0050).
create table ticket_payments (
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    amount_cents integer not null check (amount_cents between 0 and 100000000),
    received_by text not null check (received_by in ('organization', 'seller')),
    confirmed_at timestamptz not null default now(),
    confirmed_by uuid references users on delete set null,
    primary key (event_id, ticket_number)
);
