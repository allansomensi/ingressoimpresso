#!/usr/bin/env bash
# Runs the door end-to-end test: API (cargo, DATABASE_URL from the environment) on :8080 and the
# production web build on :3000, then e2e/portaria.e2e.mjs. Called by `just e2e` and by CI.
set -euo pipefail

out=target/e2e
mkdir -p "$out"
export ALLOWED_ORIGINS=http://localhost:3000
export PUBLIC_API_URL=http://localhost:8080
export NEXT_PUBLIC_API_URL=http://localhost:8080
# A fresh address per run: login codes are rate limited per e-mail.
export E2E_EMAIL="e2e-$(date +%s)@exemplo.com"
export ADMIN_EMAILS="$E2E_EMAIL"
# The test pays its batches by hand (admin): no free tickets (ADR 0024).
export FREE_TICKETS=0
export EXPORT_DIR="$out/exports"
# A throwaway master key: the e2e database holds test events only.
export TICKET_KEY_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
unset RESEND_API_KEY APP_ENV

cargo build --locked -p ingressoimpresso-server
pnpm --filter @ingressoimpresso/web run build

cleanup() {
    kill "${api_pid:-}" "${web_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT

./target/debug/ingressoimpresso > "$out/api.log" 2>&1 &
api_pid=$!
pnpm --filter @ingressoimpresso/web exec next start --port 3000 > "$out/web.log" 2>&1 &
web_pid=$!

for url in http://localhost:8080/healthz http://localhost:3000/portaria; do
    for _ in $(seq 1 60); do
        curl -fsS -o /dev/null "$url" && break
        sleep 1
    done
    curl -fsS -o /dev/null "$url" || { echo "not up: $url"; tail -50 "$out/api.log" "$out/web.log"; exit 1; }
done

E2E_API_LOG="$out/api.log" E2E_OUT="$out" node e2e/portaria.e2e.mjs
