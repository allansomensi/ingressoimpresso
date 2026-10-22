-- E-mails that bring people back (ADR 0118): an account that never made an event, an event that
-- stopped before its tickets, a door not set up days before, and "how did it go?" after it.
-- Each goes once per account (and event); `reminder_emails` turns them off.
alter table users add column reminder_emails boolean not null default true;

create table reminder_sends (
    id uuid primary key,
    user_id uuid not null references users on delete cascade,
    kind text not null check (kind in ('no_event_first', 'no_event_second', 'event_stalled',
                                       'door_setup', 'after_event')),
    event_id uuid references events on delete cascade,
    status text not null check (status in ('sent', 'failed', 'skipped')),
    created_at timestamptz not null default now()
);
create unique index reminder_sends_once_idx
    on reminder_sends (user_id, kind, coalesce(event_id, '00000000-0000-0000-0000-000000000000'));

alter table mail_sends drop constraint mail_sends_kind_check;
alter table mail_sends add constraint mail_sends_kind_check
    check (kind in ('login_code', 'signup_code', 'batch_paid', 'test', 'team_invite', 'alert',
                    'announcement', 'reminder'));
