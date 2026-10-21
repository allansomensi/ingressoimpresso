-- ADR 0109: an announcement goes to any of three channels: the bell, a dialog on opening the
-- panel, and e-mail. `display` ('notification' | 'modal') becomes two flags, and the e-mail's
-- audience is chosen with the announcement and queued when it starts.

alter table announcements
    add column bell boolean not null default true,
    add column modal boolean not null default false,
    add column email_audience text
        check (email_audience is null or email_audience in ('all', 'owners', 'paying', 'recent', 'tagged')),
    add column email_tag text check (email_tag is null or char_length(email_tag) between 1 and 30),
    -- When the e-mail of the announcement was queued (at most once by itself).
    add column email_queued_at timestamptz;

update announcements set modal = (display = 'modal');
-- A dialog was always also in the bell.
alter table announcements drop column display;

alter table announcements
    add constraint announcements_channel_check check (bell or modal or email_audience is not null),
    add constraint announcements_email_audience_tag_check
        check (case when email_audience is null then email_tag is null
                    else (email_audience = 'tagged') = (email_tag is not null) end);

-- Announcements whose e-mail still waits for the start.
create index announcements_email_due_idx on announcements (starts_at)
    where email_audience is not null and email_queued_at is null and published_at is not null
      and archived_at is null;
