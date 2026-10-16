-- ADR 0088: which release notes the person has seen belongs to the account, not to the browser.
-- The publication time of the newest note seen; null: none yet.
alter table users add column news_seen_at timestamptz;
