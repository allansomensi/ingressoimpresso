#!/usr/bin/env bash
# Restore test of an encrypted backup (ADR 0013): decrypts it with the private age key and
# restores it into RESTORE_DATABASE_URL, which must be an EMPTY database (a scratch database in
# local Docker or in a Neon branch, never production). Prints a few row counts to compare with
# the painel. Needs age, and Postgres 18 client tools or docker.
#
#   RESTORE_DATABASE_URL=postgres://... ./deploy/restore-test.sh backup.dump.age ~/backup-key.txt
set -euo pipefail

dump=${1:?usage: restore-test.sh <backup.dump.age> <age identity file>}
identity=${2:?usage: restore-test.sh <backup.dump.age> <age identity file>}
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL to an empty scratch database}"

# Postgres 18 client tools: the local ones when recent enough, otherwise the official image.
if command -v pg_restore > /dev/null && [ "$(pg_restore --version | grep -oE '[0-9]+' | head -1)" -ge 18 ]; then
    run() { command "$@"; }
else
    # The image has no root certificates: the host's are mounted for `sslmode=verify-full`.
    run() { docker run --rm -i --network host -e RESTORE_DATABASE_URL -v /etc/ssl/certs:/etc/ssl/certs:ro postgres:18 "$@"; }
fi
psql() { run psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }

if [ -n "$(psql -tAc "select to_regclass('public.events')")" ]; then
    echo "refusing: the target database already has an events table (use an empty database)" >&2
    exit 1
fi

age --decrypt --identity "$identity" "$dump" \
    | run pg_restore --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DATABASE_URL"

psql -c "select
    (select count(*) from events) as events,
    (select count(*) from ticket_batches where status = 'paid') as paid_batches,
    (select count(*) from sellers) as sellers,
    (select count(*) from scans) as scans,
    (select count(*) from entries) as entries,
    (select max(created_at) from events) as newest_event"
echo "restore OK"
