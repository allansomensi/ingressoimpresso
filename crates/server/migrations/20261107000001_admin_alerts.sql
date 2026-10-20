-- ADR 0103: alerts that reach the admins (e-mail and Telegram) and the daily summary.

-- Something that needs the admins' attention. One open alert per key: the same problem again
-- adds to its count instead of piling up, and notifies only when it opens.
create table admin_alerts (
    id uuid primary key,
    kind text not null check (kind in ('stripe_webhook', 'export_failed', 'mail_quota',
                                       'door_missing', 'api_errors', 'dispute')),
    key text not null check (char_length(key) between 1 and 200),
    severity text not null check (severity in ('warning', 'critical')),
    title text not null check (char_length(title) between 1 and 200),
    detail text check (detail is null or char_length(detail) <= 2000),
    -- Where in the panel to look (`/painel/admin?aba=...`).
    link text check (link is null or char_length(link) <= 300),
    count integer not null default 1 check (count >= 1),
    first_at timestamptz not null default now(),
    last_at timestamptz not null default now(),
    notified_at timestamptz,
    resolved_at timestamptz,
    resolved_by uuid references users on delete set null
);
create unique index admin_alerts_open_key on admin_alerts (key) where resolved_at is null;
create index admin_alerts_recent_idx on admin_alerts (last_at desc);

-- How the admins want to be told. One row.
create table alert_settings (
    id boolean primary key default true check (id),
    email boolean not null default true,
    telegram boolean not null default true,
    summary boolean not null default true,
    -- Hour of the daily summary, in Brasília time.
    summary_hour integer not null default 8 check (summary_hour between 0 and 23),
    -- An event with at least this many paid tickets that starts soon without a door link
    -- raises an alert.
    door_min_tickets integer not null default 50 check (door_min_tickets between 1 and 100000),
    updated_at timestamptz not null default now(),
    updated_by uuid references users on delete set null
);
insert into alert_settings (id) values (true);

-- The days the summary went out, so a restart never sends it twice.
create table alert_digests (
    day date primary key,
    sent_at timestamptz not null default now()
);

alter table mail_sends drop constraint mail_sends_kind_check;
alter table mail_sends add constraint mail_sends_kind_check
    check (kind in ('login_code', 'signup_code', 'batch_paid', 'test', 'team_invite', 'alert'));
