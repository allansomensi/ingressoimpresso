-- Phase 3 schema (docs/arquitetura.md §7, ADR 0011). Forward-only migrations.

create extension if not exists btree_gist;
create extension if not exists citext;

-- Accounts --------------------------------------------------------------------

create table organizations (
    id uuid primary key,
    name text not null check (char_length(name) between 1 and 100),
    created_at timestamptz not null default now()
);

create table users (
    id uuid primary key,
    email citext not null unique check (char_length(email) between 3 and 254),
    created_at timestamptz not null default now()
);

create table memberships (
    organization_id uuid not null references organizations on delete cascade,
    user_id uuid not null references users on delete cascade,
    role text not null check (role in ('owner', 'member')),
    created_at timestamptz not null default now(),
    primary key (organization_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

-- One-time login codes (ADR 0012): only a hash is stored.
create table login_codes (
    id uuid primary key,
    email citext not null,
    code_hash bytea not null,
    attempts smallint not null default 0,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
);
create index login_codes_email_idx on login_codes (email, created_at desc);

-- Bearer sessions (ADR 0016): only sha256(token) is stored.
create table sessions (
    token_hash bytea primary key,
    user_id uuid not null references users on delete cascade,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

-- Events and keys ---------------------------------------------------------------

create table events (
    id uuid primary key,
    organization_id uuid not null references organizations on delete cascade,
    name text not null check (char_length(name) between 1 and 100),
    venue text check (venue is null or char_length(venue) <= 120),
    starts_at timestamptz not null,
    ends_at timestamptz not null check (ends_at > starts_at),
    -- Lookup hint printed in the QR (ADR 0003): u32 stored in a bigint.
    qr_tag bigint not null unique check (qr_tag between 0 and 4294967295),
    ticket_price_cents integer check (ticket_price_cents is null or ticket_price_cents >= 0),
    status text not null default 'active' check (status in ('active', 'closed')),
    created_at timestamptz not null default now()
);
create index events_organization_idx on events (organization_id, starts_at desc);

-- ADR 0005: private keys sealed with XChaCha20-Poly1305 under the master key, AAD = event_id || key_id.
create table event_signing_keys (
    event_id uuid not null references events on delete cascade,
    key_id smallint not null check (key_id between 0 and 255),
    public_key bytea not null check (length(public_key) = 32),
    sealed_private_key bytea not null,
    status text not null check (status in ('active', 'retired', 'revoked')),
    created_at timestamptz not null default now(),
    primary key (event_id, key_id)
);
-- At most one active key per event.
create unique index event_signing_keys_one_active on event_signing_keys (event_id) where status = 'active';

-- Art and designs ---------------------------------------------------------------

-- Uploaded art, owned by one event (never shared across events or organizations).
create table blobs (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    sha256 bytea not null check (length(sha256) = 32),
    content_type text not null check (content_type in ('image/png', 'image/jpeg')),
    width_px integer not null check (width_px > 0),
    height_px integer not null check (height_px > 0),
    byte_size integer not null check (byte_size > 0),
    data bytea not null,
    created_at timestamptz not null default now(),
    unique (event_id, sha256)
);

-- Immutable design versions: a batch renders with the version current at export time; old
-- versions stay for reproducibility.
create table ticket_designs (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    version integer not null check (version >= 1),
    spec jsonb not null,
    art_blob_id uuid references blobs,
    created_at timestamptz not null default now(),
    unique (event_id, version)
);

-- Ranges (ADR 0011) ----------------------------------------------------------------

create table ticket_batches (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    numbers int4range not null check (lower(numbers) >= 1 and not isempty(numbers)),
    key_id smallint not null,
    status text not null check (status in ('awaiting_payment', 'paid', 'canceled')),
    price_cents integer not null default 0 check (price_cents >= 0),
    created_at timestamptz not null default now(),
    paid_at timestamptz,
    foreign key (event_id, key_id) references event_signing_keys (event_id, key_id),
    exclude using gist (event_id with =, numbers with &&) where (status <> 'canceled')
);

create table sellers (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    name text not null check (char_length(name) between 1 and 60),
    phone text check (phone is null or char_length(phone) <= 30),
    created_at timestamptz not null default now(),
    unique (event_id, name)
);

create table seller_assignments (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    seller_id uuid not null references sellers on delete cascade,
    numbers int4range not null check (lower(numbers) >= 1 and not isempty(numbers)),
    created_at timestamptz not null default now(),
    exclude using gist (event_id with =, numbers with &&)
);
create index seller_assignments_seller_idx on seller_assignments (seller_id);

create table ticket_voids (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    numbers int4range not null check (lower(numbers) >= 1 and not isempty(numbers)),
    reason text not null check (reason in ('unsold', 'lost', 'revoked')),
    note text check (note is null or char_length(note) <= 200),
    created_by uuid not null references users,
    created_at timestamptz not null default now(),
    undone_at timestamptz,
    undone_by uuid references users
);
create index ticket_voids_event_idx on ticket_voids using gist (event_id, numbers);

-- Exports (job queue + results) ---------------------------------------------------------

create table exports (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    requested_by uuid not null references users,
    kind text not null check (kind in ('home', 'print', 'control', 'whatsapp')),
    scope jsonb not null,
    crop_marks boolean not null default true,
    status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
    attempts smallint not null default 0,
    locked_at timestamptz,
    ticket_count integer,
    file_name text,
    byte_size bigint,
    error text,
    created_at timestamptz not null default now(),
    finished_at timestamptz
);
create index exports_queue_idx on exports (created_at) where status in ('queued', 'running');
create index exports_event_idx on exports (event_id, created_at desc);

-- Short-lived download links (ADR 0016): only sha256(token) is stored.
create table download_links (
    token_hash bytea primary key,
    export_id uuid not null references exports on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);
