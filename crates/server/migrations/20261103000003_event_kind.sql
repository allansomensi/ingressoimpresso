-- ADR 0084: fichas de consumo. An event is either tickets (entrance) or consumption tokens
-- (fichas de bar e de comida, numbered, checked at the stall). The QR, the numbering, the
-- categories (products), the batches and the door work the same; only the words change, and a
-- token is used once (no exit and return).
alter table events
    add column kind text not null default 'tickets' check (kind in ('tickets', 'tokens'));
alter table events add constraint events_tokens_no_reentry_check
    check (kind = 'tickets' or not reentry);
