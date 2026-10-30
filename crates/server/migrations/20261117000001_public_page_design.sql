-- ADR 0125: the organizer's own look for the event's public page.
alter table events
    -- PublicPageDesign as JSON; null: the default look.
    add column public_design jsonb,
    -- The cover image: one of the event's images (blobs), like the ticket's art.
    add column public_cover_blob_id uuid references blobs on delete set null;
