-- ADR 0020: a Checkout Session that is complete but unpaid (a Pix code shown, the transfer not
-- in yet) is "processing": it may still turn into money, so the batch cannot be canceled, paid by
-- hand or offered a second checkout until Stripe says paid or failed.
alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check
    check (status in ('open', 'processing', 'paid', 'expired', 'failed'));
