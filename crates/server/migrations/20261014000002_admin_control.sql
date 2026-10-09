-- ADR 0032: admins act on any account; what they change outside their own organization, and
-- every admin-only action, is written here.
create table audit_log (
    id uuid primary key,
    actor_id uuid references users on delete set null,
    actor_email text not null,
    action text not null check (char_length(action) between 1 and 60),
    organization_id uuid references organizations on delete set null,
    event_id uuid references events on delete set null,
    target_id uuid,
    detail jsonb not null default '{}',
    created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_organization_idx on audit_log (organization_id, created_at desc);

-- A suspended organization signs in and looks, but changes nothing.
alter table organizations
    add column suspended_at timestamptz,
    add column suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 200);

-- A refunded batch keeps its numbers taken (the exclusion constraint skips only `canceled`):
-- tickets already printed must never become valid again through a later batch.
alter table ticket_batches drop constraint ticket_batches_status_check;
alter table ticket_batches add constraint ticket_batches_status_check
    check (status in ('awaiting_payment', 'paid', 'canceled', 'refunded'));
alter table ticket_batches add column refunded_at timestamptz;

alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check
    check (status in ('open', 'processing', 'paid', 'expired', 'failed', 'refunded'));
