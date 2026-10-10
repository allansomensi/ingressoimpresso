-- Two-step verification with an authenticator app (ADR 0045).
-- The TOTP secret is sealed with the master key (keys::seal_data, purpose "totp-secret", the user
-- id); it is stored on setup and counts only once `totp_enabled_at` is set. `totp_last_step` is
-- the last 30-second step accepted, so a code cannot be used twice.
alter table users
    add column totp_secret bytea,
    add column totp_enabled_at timestamptz,
    add column totp_last_step bigint;

-- One-time recovery codes, kept as keyed hashes (keys::keyed_hash, purpose "recovery-code").
create table recovery_codes (
    id uuid primary key,
    user_id uuid not null references users (id) on delete cascade,
    code_hash bytea not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);
create index recovery_codes_user on recovery_codes (user_id) where used_at is null;
