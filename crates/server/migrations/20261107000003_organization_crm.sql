-- ADR 0105: the admins' file on each organization. Internal notes and tags; the timeline is
-- read from what already exists (signup, events, batches, payments, e-mails, admin actions).

create table organization_notes (
    id uuid primary key,
    organization_id uuid not null references organizations on delete cascade,
    author_id uuid references users on delete set null,
    author_email text not null,
    body text not null check (char_length(body) between 1 and 2000),
    pinned boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index organization_notes_organization_idx on organization_notes (organization_id, created_at desc);

-- Labels the admins choose (escola, igreja, banda, parceira…): lowercase, up to 10.
alter table organizations
    add column admin_tags text[] not null default '{}' check (cardinality(admin_tags) <= 10);
create index organizations_admin_tags_idx on organizations using gin (admin_tags);
