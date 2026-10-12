-- ADR 0064: the organization's public profile (logo, colour, contact, defaults of new events).

create table organization_profiles (
    organization_id uuid primary key references organizations on delete cascade,
    -- The current logo; older uploads under review stay as blobs for the moderation history.
    logo_blob_id uuid,
    brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$'),
    -- Digits only, with the country code (55 + area code + number): a wa.me link.
    whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
    contact_email citext check (contact_email is null or char_length(contact_email) between 3 and 254),
    website text check (website is null or (char_length(website) <= 200 and website ~ '^https?://')),
    -- Without the @.
    instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
    default_venue text check (default_venue is null or char_length(default_venue) <= 120),
    default_address text check (default_address is null or char_length(default_address) <= 200),
    default_ticket_price_cents integer
        check (default_ticket_price_cents is null or default_ticket_price_cents >= 0),
    updated_at timestamptz not null default now()
);

-- A logo is a blob of the organization, not of an event, moderated like the art (ADR 0042): the
-- same classifier, flags, review center and refusal by hash (`rejected_art`).
alter table blobs
    alter column event_id drop not null,
    add column organization_id uuid references organizations on delete cascade,
    add constraint blobs_owner_check check (num_nonnulls(event_id, organization_id) = 1);
create unique index blobs_organization_sha256_idx on blobs (organization_id, sha256)
    where organization_id is not null;

alter table organization_profiles
    add constraint organization_profiles_logo_fkey
        foreign key (logo_blob_id) references blobs on delete set null;

-- A flag on a logo has no event.
alter table moderation_flags alter column event_id drop not null;
