-- A batch left at the checkout gets one reminder (ADR 0122).
alter table reminder_sends drop constraint reminder_sends_kind_check;
alter table reminder_sends add constraint reminder_sends_kind_check
    check (kind in ('no_event_first', 'no_event_second', 'event_stalled', 'door_setup', 'after_event',
                    'unpaid_batch'));
