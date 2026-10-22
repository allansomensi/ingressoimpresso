-- The welcome tour of the panel (ADR 0116): shown once to a new account, until it finishes or
-- skips it. The outcome stays, to know how many skip.
alter table users
    add column tour_finished_at timestamptz,
    add column tour_outcome text check (tour_outcome in ('finished', 'skipped')),
    add constraint users_tour_check check ((tour_finished_at is null) = (tour_outcome is null));

-- Accounts that already have events (theirs or as part of a team) know the panel: no tour.
-- Accounts that never created anything get it on their next visit.
update users u
set tour_finished_at = now(), tour_outcome = 'finished'
where exists (select 1 from memberships m join events e on e.organization_id = m.organization_id
              where m.user_id = u.id)
   or exists (select 1 from event_team t where t.user_id = u.id);
