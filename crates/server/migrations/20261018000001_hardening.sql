-- Security hardening (ADR 0047).

-- Images the team refused, remembered by hash: deleting the event, the account or the upload no
-- longer forgets the decision, so the same bytes are refused again anywhere (ADR 0042).
create table rejected_art (
    sha256 bytea primary key check (length(sha256) = 32),
    rejected_by uuid references users on delete set null,
    created_at timestamptz not null default now()
);
insert into rejected_art (sha256)
select distinct sha256 from blobs where moderation_status = 'rejected'
on conflict do nothing;

-- Wrong second-factor codes (ADR 0045): the limit lives in the database, so a restart of the API
-- never resets a lockout. Rows are pruned by the hourly cleanup.
create table second_factor_attempts (
    id bigint generated always as identity primary key,
    user_id uuid not null references users on delete cascade,
    created_at timestamptz not null default now()
);
create index second_factor_attempts_user_idx on second_factor_attempts (user_id, created_at desc);
