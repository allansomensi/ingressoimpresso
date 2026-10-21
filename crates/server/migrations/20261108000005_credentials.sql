-- ADR 0111: credentials for the staff, the press and the artists. A badge carries a QR of the
-- event's format v1 with a number from 2,000,000,001 up (tickets stop at 9,999,999): the door
-- recognizes it, lets it in any day and in the areas chosen, and never counts it as audience.

create table event_credentials (
    id uuid primary key,
    event_id uuid not null references events on delete cascade,
    number integer not null check (number > 2000000000),
    name text not null check (char_length(name) between 1 and 80),
    role text not null check (char_length(role) between 1 and 30),
    organization text check (organization is null or char_length(organization) between 1 and 60),
    color text not null check (color ~ '^#[0-9a-f]{6}$'),
    -- Lets in at the entrance; checkpoints in credential_checkpoints.
    entrance boolean not null default true,
    revoked_at timestamptz,
    created_by uuid references users on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (event_id, number)
);
create index event_credentials_event_idx on event_credentials (event_id, number);

-- The areas (checkpoints, ADR 0092) a credential opens.
create table credential_checkpoints (
    credential_id uuid not null references event_credentials on delete cascade,
    checkpoint_id uuid not null references event_checkpoints on delete cascade,
    primary key (credential_id, checkpoint_id)
);
create index credential_checkpoints_checkpoint_idx on credential_checkpoints (checkpoint_id);

-- What the door did with a credential: let it in, or turned it away (revoked, unknown, an area it
-- does not open). Never an entry, never classified.
alter table scans drop constraint scans_local_outcome_check;
alter table scans add constraint scans_local_outcome_check check (local_outcome in
    ('admitted', 'rejected_used', 'rejected_void', 'rejected_invalid', 'rejected_other_event',
     'rejected_wrong_door', 'readmitted', 'exited', 'rejected_already_out',
     'rejected_wrong_day', 'benefit_granted', 'rejected_benefit_used', 'rejected_not_entitled',
     'credential_admitted', 'rejected_credential'));
alter table scans drop constraint scans_movement_number_check;
alter table scans add constraint scans_movement_number_check
    check (local_outcome not in ('admitted', 'readmitted', 'exited', 'rejected_already_out',
                                 'rejected_wrong_door', 'rejected_wrong_day', 'benefit_granted',
                                 'rejected_benefit_used', 'rejected_not_entitled',
                                 'credential_admitted', 'rejected_credential')
           or ticket_number is not null);
-- A credential's number is never a ticket's.
alter table scans add constraint scans_credential_number_check
    check ((local_outcome in ('credential_admitted', 'rejected_credential'))
           = (ticket_number is not null and ticket_number > 2000000000));
