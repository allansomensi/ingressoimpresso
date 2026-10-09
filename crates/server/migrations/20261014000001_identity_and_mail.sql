-- ADR 0028: e-mail quota and abuse limits. ADR 0029: "Entrar com Google". ADR 0033: terms
-- acceptance and account deletion.

-- Login codes remember a keyed hash of the requesting IP (cleared after a day) to limit how many
-- codes one address can ask for.
alter table login_codes add column ip_hash bytea check (ip_hash is null or length(ip_hash) = 32);
create index login_codes_ip_idx on login_codes (ip_hash, created_at desc) where ip_hash is not null;

-- Every e-mail handed to the provider, with no address or content: the daily quota counter.
create table mail_sends (
    id bigint generated always as identity primary key,
    kind text not null check (kind in ('login_code', 'batch_paid')),
    created_at timestamptz not null default now()
);
create index mail_sends_created_idx on mail_sends (created_at);

alter table users
    add column google_sub text unique check (google_sub is null or char_length(google_sub) between 1 and 255),
    add column name text check (name is null or char_length(name) between 1 and 100),
    add column terms_version text check (terms_version is null or char_length(terms_version) <= 20),
    add column terms_accepted_at timestamptz,
    add column last_login_at timestamptz;
