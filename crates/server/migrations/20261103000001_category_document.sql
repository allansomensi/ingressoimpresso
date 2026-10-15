-- ADR 0082: a category may ask the door to check a document (meia-entrada, Lei 12.933/2013).
-- The note says which documents count; the door shows it in large type before letting in.
alter table ticket_categories
    add column check_document boolean not null default false,
    add column document_note text
        check (document_note is null or char_length(document_note) between 1 and 80);
