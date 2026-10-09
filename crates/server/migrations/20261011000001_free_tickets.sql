-- ADR 0024: every organization gets its first free tickets. A batch records how many of its
-- tickets came from that allowance; a batch entirely free is born paid ("free").
alter table ticket_batches add column free_tickets integer not null default 0
    check (free_tickets >= 0);
alter table ticket_batches drop constraint ticket_batches_paid_via_check;
alter table ticket_batches add constraint ticket_batches_paid_via_check
    check (paid_via in ('stripe', 'admin', 'free'));
