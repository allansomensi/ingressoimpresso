-- ADR 0114: certificates designed like the tickets. The whole design (front, optional back, frame,
-- elements dragged into place) is one JSON document checked by the render crate; the images it
-- uses are blobs of the event, listed here so the cleanup of abandoned uploads keeps them. Rows
-- saved before keep their words in the old columns and become the "Clássico" design when read.
alter table certificate_settings
    add column design jsonb,
    add column image_blob_ids uuid[] not null default '{}',
    alter column title drop not null,
    alter column body drop not null,
    alter column color drop not null;
