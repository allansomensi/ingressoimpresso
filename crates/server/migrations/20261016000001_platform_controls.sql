-- Platform controls (ADRs 0037–0043): settings, announcements, in-app notifications, prices,
-- promotions, promo codes and credits, the mail log, art moderation and status incidents.

-- Settings (ADR 0037) -----------------------------------------------------------------------

-- One row: maintenance, sign-ups and blocked e-mail domains. Typed columns, not a JSON bag, so
-- every value has a constraint.
create table platform_settings (
    id boolean primary key default true check (id),
    maintenance_mode text not null default 'off'
        check (maintenance_mode in ('off', 'read_only', 'full')),
    maintenance_message text check (maintenance_message is null or char_length(maintenance_message) <= 500),
    maintenance_ends_at timestamptz,
    maintenance_started_at timestamptz,
    registrations_open boolean not null default true,
    blocked_email_domains text[] not null default '{}'
        check (cardinality(blocked_email_domains) <= 1000),
    updated_at timestamptz not null default now(),
    updated_by uuid references users on delete set null
);
insert into platform_settings (id) values (true);

-- Announcements (ADR 0038) ------------------------------------------------------------------

create table announcements (
    id uuid primary key,
    title text not null check (char_length(title) between 3 and 120),
    body text not null check (char_length(body) between 1 and 4000),
    level text not null default 'info' check (level in ('info', 'success', 'warning', 'critical')),
    -- 'notification': only in the bell; 'modal': also a dialog when the user opens the panel.
    display text not null default 'notification' check (display in ('notification', 'modal')),
    cta_label text check (cta_label is null or char_length(cta_label) between 1 and 40),
    cta_url text check (cta_url is null or char_length(cta_url) between 1 and 500),
    starts_at timestamptz not null default now(),
    ends_at timestamptz,
    published_at timestamptz,
    archived_at timestamptz,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at is null or ends_at > starts_at),
    check ((cta_label is null) = (cta_url is null))
);
create index announcements_live_idx on announcements (starts_at desc)
    where published_at is not null and archived_at is null;

create table announcement_receipts (
    announcement_id uuid not null references announcements on delete cascade,
    user_id uuid not null references users on delete cascade,
    seen_at timestamptz not null default now(),
    dismissed_at timestamptz,
    primary key (announcement_id, user_id)
);

-- In-app notifications of one user: what happened to their account (ADR 0038). The text is
-- written by the panel from `kind` and `data`.
create table notifications (
    id uuid primary key,
    user_id uuid not null references users on delete cascade,
    kind text not null check (kind in ('art_rejected', 'art_approved', 'credits_granted',
                                       'free_tickets_granted', 'discount_granted', 'price_change')),
    data jsonb not null default '{}',
    read_at timestamptz,
    created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- Prices (ADR 0039) -------------------------------------------------------------------------

-- Versions of the price table: the one in force is the latest with `effective_at <= now()`. A
-- version may start in the future (announced first); old versions stay for history.
create table price_tables (
    id uuid primary key,
    -- [{"upTo": 100, "unitCents": 15}, ...], validated by the API (increasing, last covers 5,000).
    tiers jsonb not null check (jsonb_typeof(tiers) = 'array'),
    minimum_cents integer not null check (minimum_cents between 0 and 100000),
    free_tickets integer not null check (free_tickets between 0 and 100000),
    effective_at timestamptz not null,
    note text check (note is null or char_length(note) <= 200),
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now()
);
create index price_tables_effective_idx on price_tables (effective_at desc);
-- The prices of ADR 0024, in force since the beginning.
insert into price_tables (id, tiers, minimum_cents, free_tickets, effective_at, note)
values ('8f1d6a52-3c1e-4b6f-9a2d-6c0e5b7a9d01',
        '[{"upTo": 100, "unitCents": 15}, {"upTo": 500, "unitCents": 10},
          {"upTo": 2000, "unitCents": 7}, {"upTo": 5000, "unitCents": 5}]',
        290, 30, '2026-01-01T00:00:00Z', 'Preços de lançamento');

-- Time-limited discounts on every batch (ADR 0039).
create table promotions (
    id uuid primary key,
    name text not null check (char_length(name) between 1 and 80),
    headline text check (headline is null or char_length(headline) <= 120),
    discount_percent integer not null check (discount_percent between 1 and 100),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    active boolean not null default true,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    check (ends_at > starts_at)
);
create index promotions_window_idx on promotions (starts_at, ends_at) where active;

-- Promo codes (ADR 0040): credit in reais, free tickets or a discount on the next batch.
create table promo_codes (
    id uuid primary key,
    code text not null unique check (code ~ '^[A-Z0-9_-]{4,32}$'),
    kind text not null check (kind in ('credit', 'free_tickets', 'discount')),
    credit_cents integer check (credit_cents is null or credit_cents between 1 and 10000000),
    free_tickets integer check (free_tickets is null or free_tickets between 1 and 100000),
    discount_percent integer check (discount_percent is null or discount_percent between 1 and 100),
    description text check (description is null or char_length(description) <= 200),
    max_redemptions integer check (max_redemptions is null or max_redemptions >= 1),
    redemptions_count integer not null default 0 check (redemptions_count >= 0),
    new_organizations_only boolean not null default false,
    starts_at timestamptz,
    expires_at timestamptz,
    disabled_at timestamptz,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    check ((kind = 'credit') = (credit_cents is not null)),
    check ((kind = 'free_tickets') = (free_tickets is not null)),
    check ((kind = 'discount') = (discount_percent is not null)),
    check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table promo_redemptions (
    id uuid primary key,
    promo_code_id uuid not null references promo_codes on delete cascade,
    organization_id uuid not null references organizations on delete cascade,
    redeemed_by uuid references users on delete set null,
    redeemed_at timestamptz not null default now(),
    -- A discount code waits for the next batch; the batch that used it.
    applied_batch_id uuid references ticket_batches on delete set null,
    applied_at timestamptz,
    unique (promo_code_id, organization_id)
);
create index promo_redemptions_organization_idx on promo_redemptions (organization_id, redeemed_at desc);

-- Credit of an organization in centavos: an append-only ledger, the balance is the sum.
create table credit_ledger (
    id uuid primary key,
    organization_id uuid not null references organizations on delete cascade,
    amount_cents integer not null check (amount_cents <> 0),
    reason text not null check (reason in ('promo_code', 'admin_adjustment', 'batch_payment',
                                           'batch_cancel', 'batch_refund')),
    reference_id uuid,
    note text check (note is null or char_length(note) <= 200),
    actor_id uuid references users on delete set null,
    created_at timestamptz not null default now()
);
create index credit_ledger_organization_idx on credit_ledger (organization_id, created_at desc);

-- How a batch's price was made (all in centavos; price_cents stays what is charged).
alter table ticket_batches
    add column list_price_cents integer check (list_price_cents is null or list_price_cents >= 0),
    add column promotion_id uuid references promotions on delete set null,
    add column discount_cents integer not null default 0 check (discount_cents >= 0),
    add column credit_cents integer not null default 0 check (credit_cents >= 0),
    add column price_table_id uuid references price_tables on delete set null;
alter table ticket_batches drop constraint ticket_batches_paid_via_check;
alter table ticket_batches add constraint ticket_batches_paid_via_check
    check (paid_via in ('stripe', 'admin', 'free', 'credit'));

-- Mail log (ADR 0041) -----------------------------------------------------------------------

alter table mail_sends
    add column to_email citext,
    add column subject text check (subject is null or char_length(subject) <= 200),
    add column status text not null default 'sent'
        check (status in ('sending', 'sent', 'failed', 'quota', 'delivered', 'delivery_delayed',
                          'bounced', 'complained')),
    add column provider_id text,
    add column error text check (error is null or char_length(error) <= 500),
    add column updated_at timestamptz not null default now();
alter table mail_sends drop constraint mail_sends_kind_check;
alter table mail_sends add constraint mail_sends_kind_check
    check (kind in ('login_code', 'signup_code', 'batch_paid', 'test'));
create index mail_sends_provider_idx on mail_sends (provider_id) where provider_id is not null;
create index mail_sends_status_idx on mail_sends (status, created_at desc);

-- Art moderation (ADR 0042) -----------------------------------------------------------------

alter table blobs
    add column moderation_status text not null default 'unchecked'
        check (moderation_status in ('unchecked', 'clean', 'flagged', 'approved', 'rejected')),
    add column uploaded_by uuid references users on delete set null;
create index blobs_sha256_idx on blobs (sha256);

create table moderation_flags (
    id uuid primary key,
    blob_id uuid not null references blobs on delete cascade,
    organization_id uuid not null references organizations on delete cascade,
    event_id uuid not null references events on delete cascade,
    reasons text[] not null check (cardinality(reasons) >= 1),
    -- Likelihoods from the classifier (0–5 per category) and its score (0–1).
    details jsonb not null default '{}',
    score real not null default 0 check (score between 0 and 1),
    source text not null check (source in ('automatic', 'manual')),
    status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
    resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
    resolved_by uuid references users on delete set null,
    resolved_at timestamptz,
    created_at timestamptz not null default now()
);
create index moderation_flags_status_idx on moderation_flags (status, created_at desc);
create unique index moderation_flags_one_open on moderation_flags (blob_id) where status = 'open';

-- Daily classifier spending (one row per UTC day).
create table moderation_usage (
    day date primary key,
    requests integer not null default 0 check (requests >= 0)
);

-- Status incidents (ADR 0043) ---------------------------------------------------------------

create table status_incidents (
    id uuid primary key,
    kind text not null default 'incident' check (kind in ('incident', 'maintenance')),
    title text not null check (char_length(title) between 3 and 120),
    impact text not null default 'minor' check (impact in ('none', 'minor', 'major', 'critical')),
    status text not null check (status in ('scheduled', 'investigating', 'identified', 'monitoring', 'resolved')),
    components text[] not null default '{}'
        check (components <@ array['site', 'panel', 'door', 'payments', 'email', 'files']::text[]),
    scheduled_for timestamptz,
    scheduled_until timestamptz,
    started_at timestamptz not null default now(),
    resolved_at timestamptz,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    check (scheduled_until is null or scheduled_for is null or scheduled_until > scheduled_for)
);
create index status_incidents_started_idx on status_incidents (started_at desc);

create table status_incident_updates (
    id uuid primary key,
    incident_id uuid not null references status_incidents on delete cascade,
    status text not null check (status in ('scheduled', 'investigating', 'identified', 'monitoring', 'resolved')),
    body text not null check (char_length(body) between 1 and 2000),
    author_id uuid references users on delete set null,
    created_at timestamptz not null default now()
);
create index status_incident_updates_incident_idx on status_incident_updates (incident_id, created_at desc);

-- Audit log filters (ADR 0032 + 0037) -------------------------------------------------------

create index audit_log_action_idx on audit_log (action, created_at desc);
create index audit_log_actor_idx on audit_log (actor_email, created_at desc);
