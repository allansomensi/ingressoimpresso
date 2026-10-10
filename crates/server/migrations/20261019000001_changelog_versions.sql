-- ADR 0049: a note belongs to the release that brought it, so "Novidades" reads as release notes.
-- Null: a note outside any release (and drafts until an admin picks one).
alter table changelog_entries
    add column version text check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$');

-- Everything published before versioning shipped in 1.0.0, the first numbered release.
update changelog_entries set version = '1.0.0' where published_at is not null;
