-- ADR 0095: the event's public page (/e/<slug>), turned on by the organizer.

alter table events
    add column public_page boolean not null default false,
    -- Lowercase letters, digits and single hyphens: "arraia-sao-jose". Unique across events.
    add column public_slug text unique
        check (public_slug is null or public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_slug) between 3 and 60),
    -- The organizer says it is sold out (the page also says so when every number is gone).
    add column public_sold_out boolean not null default false,
    -- An extra paragraph for the page ("Traga um prato de doce!").
    add column public_description text
        check (public_description is null or char_length(public_description) between 1 and 600),
    add constraint events_public_page_slug check (not public_page or public_slug is not null);

-- Sellers listed on the page with a WhatsApp button (their phone is public only then).
alter table sellers add column on_public_page boolean not null default false;
