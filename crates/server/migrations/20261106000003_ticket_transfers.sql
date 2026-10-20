-- ADR 0097: the holder passes a digital ticket on. The link changes, the number and its QR stay.

-- The organizer may turn transfers off per event (on by default).
alter table events add column ticket_transfers boolean not null default true;

alter table ticket_links
    -- The link was replaced by a transfer (it opens as "transferred", never again as a ticket).
    add column transferred_at timestamptz,
    -- Transfers this number went through up to this link (a limit keeps resale chains short).
    add column transfer_count smallint not null default 0 check (transfer_count between 0 and 100),
    add column transferred_from uuid references ticket_links on delete set null;
