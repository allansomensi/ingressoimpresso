-- ADR 0031: "Novidades", notes the admins publish about what changed.
create table changelog_entries (
    id uuid primary key,
    kind text not null check (kind in ('new', 'improvement', 'fix', 'security')),
    title text not null check (char_length(title) between 1 and 120),
    body text not null default '' check (char_length(body) <= 4000),
    -- Null while a draft.
    published_at timestamptz,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index changelog_published_idx on changelog_entries (published_at desc) where published_at is not null;
