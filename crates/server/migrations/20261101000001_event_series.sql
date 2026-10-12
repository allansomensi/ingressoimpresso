-- ADR 0077: an event with several dates. Each date is a whole event (its own numbers, batches,
-- keys, QR tag, door and settlement); the series only groups them and carries the shared name.
create table event_series (
    id uuid primary key,
    organization_id uuid not null references organizations on delete cascade,
    name text not null check (char_length(name) between 1 and 100),
    created_at timestamptz not null default now()
);
create index event_series_organization_idx on event_series (organization_id);

-- A date leaves the series when the series goes; a series with fewer than two dates is dissolved
-- by the API (deleting or detaching a date).
alter table events add column series_id uuid references event_series on delete set null;
create index events_series_idx on events (series_id, starts_at) where series_id is not null;

