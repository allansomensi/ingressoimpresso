-- ADR 0025: tickets print the event's date and time in the wall-clock time of its place. The
-- painel sends local times with their offset; events created before keep Brasília time.
alter table events add column utc_offset_minutes smallint not null default -180
    check (utc_offset_minutes between -720 and 840);
