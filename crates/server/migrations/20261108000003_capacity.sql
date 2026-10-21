-- ADR 0110: the venue's capacity. The door phones and the live view count who is in against it,
-- and the organization hears once when it gets close and once when it is full.

alter table events
    add column capacity integer check (capacity is null or capacity between 1 and 1000000),
    -- Share of the capacity that turns the counter yellow and warns the organization.
    add column capacity_warn_percent smallint not null default 90
        check (capacity_warn_percent between 50 and 99),
    -- What the organization was told: 0 nothing, 1 close to full, 2 full.
    add column capacity_alerted smallint not null default 0 check (capacity_alerted between 0 and 2);

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
    check (kind in ('art_rejected', 'art_approved', 'credits_granted', 'free_tickets_granted',
                    'discount_granted', 'price_change', 'team_added', 'event_postponed',
                    'event_canceled', 'referral_rewarded', 'capacity_near', 'capacity_full'));
