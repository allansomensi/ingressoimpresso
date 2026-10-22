-- Hardening round of 2026-10-22 (ADR 0119).

-- The credit a batch spent is given back once: canceling, pricing at zero and refunding all
-- call the same function, and only the first call may insert the ledger line.
alter table ticket_batches add column credit_returned_at timestamptz;

-- One mailbox, one set of free tickets: `me+2@gmail.com` is the same mailbox as `me@gmail.com`
-- (the rule of referrals' canonical_email). Kept as a keyed hash that survives the deletion of
-- the account, like rejected_art, so deleting and signing up again earns nothing.
create table known_mailboxes (
    mailbox_hash bytea primary key check (length(mailbox_hash) = 32),
    first_seen_at timestamptz not null default now()
);

-- A second account of a mailbox that already has one gets no free tickets of the price table
-- (the admins' bonus still counts).
alter table organizations add column free_tickets_eligible boolean not null default true;

