-- ADR 0121: photos laid over the ticket's art, and a picture across the stub. Blobs of the event
-- like the art and the sponsors' logos (moderated the same way): one per photo of the design
-- version, in the same order, and the stub's own.
alter table ticket_designs
    add column photo_blob_ids uuid[] not null default '{}'
        check (cardinality(photo_blob_ids) <= 4),
    add column stub_image_blob_id uuid references blobs;
