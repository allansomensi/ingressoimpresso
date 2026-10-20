-- Announcements also by e-mail (ADR 0107): who wants them, each sending and its recipients.

-- Announcement e-mails are optional; codes, payments and invitations always go out.
alter table users add column announcement_emails boolean not null default true;

create table announcement_mailings (
    id uuid primary key,
    announcement_id uuid not null references announcements on delete cascade,
    audience text not null check (audience in ('all', 'owners', 'paying', 'recent', 'tagged')),
    tag text check (tag is null or char_length(tag) between 1 and 30),
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    finished_at timestamptz,
    canceled_at timestamptz,
    check ((audience = 'tagged') = (tag is not null))
);
-- One sending at a time per announcement.
create unique index announcement_mailings_running_idx on announcement_mailings (announcement_id)
    where finished_at is null and canceled_at is null;

create table announcement_mail_recipients (
    mailing_id uuid not null references announcement_mailings on delete cascade,
    announcement_id uuid not null references announcements on delete cascade,
    user_id uuid not null references users on delete cascade,
    status text not null default 'pending'
        check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
    sent_at timestamptz,
    primary key (mailing_id, user_id),
    -- Nobody gets the same announcement twice, whatever the audiences chosen.
    unique (announcement_id, user_id)
);
create index announcement_mail_recipients_pending_idx on announcement_mail_recipients (mailing_id)
    where status in ('pending', 'sending');

alter table mail_sends drop constraint mail_sends_kind_check;
alter table mail_sends add constraint mail_sends_kind_check
    check (kind in ('login_code', 'signup_code', 'batch_paid', 'test', 'team_invite', 'alert',
                    'announcement'));
