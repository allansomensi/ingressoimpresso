-- ADR 0020: batches paid online with Stripe Checkout. One row per payment attempt (Checkout
-- Session); the batch becomes `paid` only from a verified webhook or a session read back from
-- Stripe, or by an admin (ADR 0014's fallback, kept).

create table payments (
    id uuid primary key,
    batch_id uuid not null references ticket_batches on delete cascade,
    provider text not null default 'stripe' check (provider in ('stripe')),
    checkout_session_id text not null unique,
    checkout_url text not null,
    amount_cents integer not null check (amount_cents > 0),
    currency text not null check (currency = 'brl'),
    status text not null default 'open' check (status in ('open', 'paid', 'expired', 'failed')),
    payment_intent_id text,
    created_by uuid not null references users,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    paid_at timestamptz
);
create index payments_batch_idx on payments (batch_id, created_at desc);

-- How a paid batch was paid: online or by an admin.
alter table ticket_batches
    add column paid_via text check (paid_via in ('stripe', 'admin'));
update ticket_batches set paid_via = 'admin' where status = 'paid';
