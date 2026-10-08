-- Door (phase 4): access links, devices, scan log and first entries (ADRs 0006, 0007).

-- Access links shared with door volunteers: only sha256(token) is stored; the token travels in
-- the URL fragment (#acesso=...).
create table door_accesses (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    label text not null check (char_length(label) between 1 and 60),
    token_hash bytea not null unique check (length(token_hash) = 32),
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_by uuid not null references users,
    created_at timestamptz not null default now()
);
create index door_accesses_event_idx on door_accesses (event_id, created_at desc);

-- A phone registered through an access link; it authenticates with a secret (hash stored).
create table door_devices (
    id uuid primary key,
    door_access_id uuid not null references door_accesses on delete cascade,
    event_id uuid not null references events on delete cascade,
    name text not null check (char_length(name) between 1 and 40),
    secret_hash bytea not null unique check (length(secret_hash) = 32),
    created_at timestamptz not null default now(),
    last_seen_at timestamptz,
    revoked_at timestamptz
);
create index door_devices_access_idx on door_devices (door_access_id);
create index door_devices_event_idx on door_devices (event_id);

-- Append-only scan log (G-Set): ids are generated on the phone, so uploads are idempotent.
create table scans (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    device_id uuid not null references door_devices on delete cascade,
    ticket_number integer check (ticket_number is null or ticket_number >= 1),
    key_id smallint check (key_id is null or key_id between 0 and 255),
    local_outcome text not null check (local_outcome in
        ('admitted', 'rejected_used', 'rejected_void', 'rejected_invalid', 'rejected_other_event')),
    scanned_at timestamptz not null,
    received_at timestamptz not null default now(),
    confirmed_online boolean not null default false,
    server_class text check (server_class in ('first_entry', 'duplicate_entry', 'void_entry')),
    -- Safe sync cursor (outbox pattern): rows are served only below the snapshot's xmin.
    txid xid8 not null default pg_current_xact_id(),
    check ((local_outcome = 'admitted') = (server_class is not null)),
    check (local_outcome <> 'admitted' or ticket_number is not null)
);
create index scans_event_txid_idx on scans (event_id, txid);
create index scans_device_idx on scans (device_id);

-- First entry of each ticket: the atomic online confirmation is an insert here. The scan is
-- inserted after its entry (its class depends on the insert), hence the deferred foreign key.
create table entries (
    event_id uuid not null references events on delete cascade,
    ticket_number integer not null check (ticket_number >= 1),
    first_scan_id uuid not null references scans on delete cascade deferrable initially deferred,
    primary key (event_id, ticket_number)
);
