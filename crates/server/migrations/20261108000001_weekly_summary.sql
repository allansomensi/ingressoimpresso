-- ADR 0108: the admins' summary goes out every week (or every day), by e-mail; Telegram only if
-- the admins ask for it there too.

alter table alert_settings
    add column summary_frequency text not null default 'weekly'
        check (summary_frequency in ('daily', 'weekly')),
    -- ISO weekday of the weekly summary: 1 = Monday … 7 = Sunday.
    add column summary_weekday smallint not null default 1 check (summary_weekday between 1 and 7),
    add column summary_telegram boolean not null default false;
