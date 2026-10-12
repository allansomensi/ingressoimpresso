-- Refunds made on Stripe (`charge.refunded`, partial ones included): how much of each payment
-- went back and when. `refunded_cents` only grows, so a replayed or late event changes nothing.
alter table payments
    add column refunded_cents integer not null default 0,
    add column refunded_at timestamptz,
    -- Last time the admin's "check refunds on Stripe" read this payment back.
    add column refunds_checked_at timestamptz,
    add constraint payments_refunded_cents_check
        check (refunded_cents between 0 and amount_cents),
    add constraint payments_refunded_at_check
        check ((refunded_cents = 0) = (refunded_at is null));
create index payments_payment_intent_idx on payments (payment_intent_id)
    where payment_intent_id is not null;

-- Payments an admin already refunded (ADR 0032) were refunded in full.
update payments p
   set refunded_cents = p.amount_cents,
       refunded_at = coalesce(b.refunded_at, p.paid_at, p.created_at)
  from ticket_batches b
 where b.id = p.batch_id and p.status = 'refunded';

-- The service's money, one row per movement: what came in (`gross`) and what went back
-- (`refund`). Stripe money is counted by payment (a session paid twice counts twice, and so
-- does its refund); batches paid another way (admin, credit, free) by their price.
create view revenue_entries as
select 'gross'::text as kind, p.batch_id, p.amount_cents::bigint as cents, p.paid_at as at
  from payments p
 where p.status in ('paid', 'refunded') and p.paid_at is not null
union all
select 'refund', p.batch_id, p.refunded_cents::bigint, p.refunded_at
  from payments p
 where p.refunded_cents > 0
union all
select 'gross', b.id, b.price_cents::bigint, b.paid_at
  from ticket_batches b
 where b.status in ('paid', 'refunded') and b.paid_at is not null
   and b.paid_via is distinct from 'stripe'
union all
select 'refund', b.id, b.price_cents::bigint, b.refunded_at
  from ticket_batches b
 where b.status = 'refunded' and b.refunded_at is not null and b.price_cents > 0
   and b.paid_via is distinct from 'stripe';
