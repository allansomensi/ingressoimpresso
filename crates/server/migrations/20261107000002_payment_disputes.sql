-- ADR 0104: card payments disputed on Stripe (chargebacks). A dispute keeps Stripe's own status;
-- the admins decide whether the batch's numbers stop opening the door while it lasts.
create table payment_disputes (
    -- Stripe's dispute id (`dp_…`).
    id text primary key check (char_length(id) between 3 and 100),
    payment_id uuid references payments on delete set null,
    batch_id uuid references ticket_batches on delete set null,
    charge_id text,
    payment_intent_id text,
    amount_cents bigint not null check (amount_cents >= 0),
    -- Stripe's reason (`fraudulent`, `product_not_received`…).
    reason text not null check (char_length(reason) between 1 and 60),
    -- Stripe's status: warning_needs_response, needs_response, warning_under_review,
    -- under_review, won, lost, warning_closed, charge_refunded, prevented.
    status text not null check (char_length(status) between 1 and 40),
    evidence_due_by timestamptz,
    opened_at timestamptz not null,
    updated_at timestamptz not null default now(),
    closed_at timestamptz,
    -- The numbers blocked at the door while the dispute lasts: a void, undone to unblock.
    block_void_id uuid references ticket_voids on delete set null,
    -- A lost dispute settled like a refund (ADR 0032): the batch is refunded for good.
    settled_at timestamptz,
    settled_by uuid references users on delete set null
);
create index payment_disputes_batch_idx on payment_disputes (batch_id);
create index payment_disputes_open_idx on payment_disputes (opened_at desc) where closed_at is null;
