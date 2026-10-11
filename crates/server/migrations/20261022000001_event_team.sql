-- ADR 0055: an event's team. The organization keeps owning the event; each person added by
-- e-mail sees the whole event and changes only the parts they take care of (`areas`).
create table event_team (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    email citext not null check (char_length(email) between 3 and 254),
    -- How the team calls this person ("Ana"); shown to sellers only for `money`.
    name text check (name is null or char_length(name) between 1 and 80),
    -- Null until the e-mail has an account: linked on the first sign-in.
    user_id uuid references users on delete cascade,
    -- manage: everything but deleting, archiving or duplicating the event; money: what sellers
    -- hand over and give back; delivery: sellers, ranges, links, files, digital tickets and
    -- voids; art: the ticket design; door: door links and phones.
    areas text[] not null check (
        cardinality(areas) between 1 and 5
        and areas <@ array['manage', 'money', 'delivery', 'art', 'door']::text[]
    ),
    invited_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    joined_at timestamptz,
    unique (event_id, email)
);
create index event_team_user_idx on event_team (user_id) where user_id is not null;
create index event_team_email_idx on event_team (email) where user_id is null;

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
    check (kind in ('art_rejected', 'art_approved', 'credits_granted', 'free_tickets_granted',
                    'discount_granted', 'price_change', 'team_added'));

alter table mail_sends drop constraint mail_sends_kind_check;
alter table mail_sends add constraint mail_sends_kind_check
    check (kind in ('login_code', 'signup_code', 'batch_paid', 'test', 'team_invite'));
