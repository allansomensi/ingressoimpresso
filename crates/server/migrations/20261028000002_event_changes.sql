-- ADR 0065 (postpone or cancel an event) and ADR 0066 (address of the venue).

alter table events
    add column address text check (address is null or char_length(address) <= 200),
    -- The start before the first postponement: the notice says "was on …" even after a second one.
    add column postponed_from_starts_at timestamptz,
    add column postponed_at timestamptz,
    add column postpone_reason text check (postpone_reason is null or char_length(postpone_reason) <= 200),
    add column canceled_at timestamptz,
    add column cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
    add constraint events_postponed_check
        check ((postponed_from_starts_at is null) = (postponed_at is null)),
    add constraint events_canceled_reason_check
        check (canceled_at is not null or cancel_reason is null);

-- The team hears about a postponement or a cancellation in the bell.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
    check (kind in ('art_rejected', 'art_approved', 'credits_granted', 'free_tickets_granted',
                    'discount_granted', 'price_change', 'team_added', 'event_postponed',
                    'event_canceled'));
