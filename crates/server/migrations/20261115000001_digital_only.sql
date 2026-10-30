-- ADR 0123: events whose tickets only go to phones, and what the organizer keeps about each
-- digital ticket to send it (and send it again).
alter table events add column digital_only boolean not null default false;

alter table ticket_links
    -- Digits only, with the country code (5511999998888); opens the WhatsApp conversation again.
    add column holder_phone text check (holder_phone is null or holder_phone ~ '^[0-9]{10,15}$'),
    -- What the organizer wrote down ("Pix conferido 12/11"); never shown to the holder.
    add column note text check (note is null or char_length(note) between 1 and 200),
    -- Last time someone on the panel sent it (WhatsApp, copied link).
    add column sent_at timestamptz;
