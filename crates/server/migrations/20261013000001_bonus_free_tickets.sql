-- ADR 0026: an admin may give an organization extra free tickets (courtesy, support, partners),
-- on top of the FREE_TICKETS every organization gets (ADR 0024).
alter table organizations add column bonus_free_tickets integer not null default 0
    check (bonus_free_tickets between 0 and 100000);
