-- ADR 0075 (check a ticket before buying it) and ADR 0076 (refer and earn).

-- Public check: on by default; the organizer may turn it off per event.
alter table events add column public_verify boolean not null default true;

-- Each organization's referral code, created the first time it is shown.
alter table organizations
    add column referral_code text unique check (referral_code is null or referral_code ~ '^[A-Z0-9]{6,12}$');

-- The program's switches, changed by admins (audited).
alter table platform_settings
    add column referrals_enabled boolean not null default true,
    add column referral_referrer_cents integer not null default 1000
        check (referral_referrer_cents between 0 and 100000),
    add column referral_referred_cents integer not null default 1000
        check (referral_referred_cents between 0 and 100000),
    -- Rewards one organization may earn as the referrer in any 30 days.
    add column referral_monthly_limit integer not null default 10
        check (referral_monthly_limit between 0 and 1000),
    -- Smallest amount actually paid (Stripe or confirmed by an admin) that counts as the first batch.
    add column referral_min_batch_cents integer not null default 1500
        check (referral_min_batch_cents between 0 and 10000000);

create table referrals (
    id uuid primary key,
    -- Both sides survive the other's deletion: the row keeps the history and the e-mail hash.
    referrer_organization_id uuid references organizations on delete set null,
    referred_organization_id uuid references organizations on delete set null,
    code text not null,
    -- Keyed hash of the referred e-mail, aliases folded: one e-mail counts once, ever.
    referred_email_hash bytea not null unique,
    -- What the referrer sees: "ma•••@gmail.com".
    referred_email_hint text not null check (char_length(referred_email_hint) <= 120),
    status text not null default 'pending' check (status in ('pending', 'rewarded', 'revoked')),
    created_at timestamptz not null default now(),
    -- The batch whose payment earned the reward; its full refund revokes it.
    qualifying_batch_id uuid references ticket_batches on delete set null,
    rewarded_at timestamptz,
    referrer_cents integer not null default 0 check (referrer_cents >= 0),
    referred_cents integer not null default 0 check (referred_cents >= 0),
    -- The referrer was over the monthly limit: only the referred organization earned.
    referrer_capped boolean not null default false,
    revoked_at timestamptz,
    revoke_reason text check (revoke_reason is null or revoke_reason in ('batch_refunded', 'admin')),
    check (status <> 'pending' or rewarded_at is null),
    check (status <> 'rewarded' or rewarded_at is not null),
    check ((status = 'revoked') = (revoked_at is not null))
);
create unique index referrals_referred_idx on referrals (referred_organization_id);
create index referrals_referrer_idx on referrals (referrer_organization_id, created_at desc);
create index referrals_batch_idx on referrals (qualifying_batch_id) where qualifying_batch_id is not null;

alter table credit_ledger drop constraint credit_ledger_reason_check;
alter table credit_ledger add constraint credit_ledger_reason_check
    check (reason in ('promo_code', 'admin_adjustment', 'batch_payment', 'batch_cancel',
                      'batch_refund', 'referral', 'referral_revoked'));
-- A reward is credited once per organization and referral, whatever path confirms the payment.
create unique index credit_ledger_referral_idx on credit_ledger (reference_id, organization_id, reason)
    where reason in ('referral', 'referral_revoked');

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
    check (kind in ('art_rejected', 'art_approved', 'credits_granted', 'free_tickets_granted',
                    'discount_granted', 'price_change', 'team_added', 'event_postponed',
                    'event_canceled', 'referral_rewarded'));
