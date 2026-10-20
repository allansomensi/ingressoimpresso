-- ADR 0096 (notice to the sellers, commission and courtesies under control) and ADR 0099 (the
-- team's history of an event).

-- A pinned notice on every seller's link ("acerto sábado às 10h na secretaria").
alter table events
    add column seller_notice text check (seller_notice is null or char_length(seller_notice) between 1 and 280),
    add column seller_notice_at timestamptz;

-- What a seller keeps of what they sold: a share of the amount (basis points, 1 = 0.01%) or an
-- amount per ticket (cents). Taken off what they hand over in the settlement.
alter table sellers
    add column commission_kind text check (commission_kind in ('percent', 'per_ticket')),
    add column commission_value integer,
    add constraint sellers_commission_check check (
        (commission_kind is null and commission_value is null)
        or (commission_kind = 'percent' and commission_value between 1 and 10000)
        or (commission_kind = 'per_ticket' and commission_value between 1 and 1000000)
    );

-- Who may give courtesies (the director, the band…) and how many each one may give.
create table courtesy_givers (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    name text not null check (char_length(name) between 1 and 60),
    -- `null`: no limit.
    quota integer check (quota is null or quota between 1 and 100000),
    created_at timestamptz not null default now()
);
create unique index courtesy_givers_name on courtesy_givers (event_id, lower(name));

-- A paid number given away: it enters like any other, and nobody owes its price.
create table courtesies (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    giver_id uuid not null references courtesy_givers on delete restrict,
    recipient text not null check (char_length(recipient) between 1 and 80),
    reason text check (reason is null or char_length(reason) between 1 and 120),
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    unique (event_id, ticket_number)
);
create index courtesies_giver on courtesies (giver_id);

-- Every change made to an event (by its organization, its team or an admin in support mode):
-- who, when and which action. Written only after the change succeeded.
create table event_activity (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    user_id uuid references users on delete set null,
    -- Kept as they were: the person may leave the team or delete the account.
    actor_name text,
    actor_email text not null,
    -- The request's shape, "PUT events/{id}/design": the panel turns it into words.
    action text not null check (char_length(action) <= 120),
    -- The part of the team it belongs to (ADR 0055), when it has one.
    area text,
    support boolean not null default false,
    created_at timestamptz not null default now()
);
create index event_activity_event on event_activity (event_id, created_at desc);
