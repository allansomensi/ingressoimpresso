-- ADR 0059: sponsors' logos on the ticket. They are blobs of the event like the art (moderated
-- the same way), referenced by the design version in order.
alter table ticket_designs
    add column sponsor_blob_ids uuid[] not null default '{}'
        check (cardinality(sponsor_blob_ids) <= 6);
