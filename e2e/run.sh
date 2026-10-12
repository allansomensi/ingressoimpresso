#!/usr/bin/env bash
# Runs the door and seller end-to-end tests and the CSP check: API (cargo, DATABASE_URL from the environment) on :8080 and the
# production web build on :3000, then e2e/portaria.e2e.mjs. Called by `just e2e` and by CI.
# E2E_API_PORT and E2E_WEB_PORT move them (several worktrees on one machine).
set -euo pipefail

out=target/e2e
mkdir -p "$out"
api_port="${E2E_API_PORT:-8080}"
web_port="${E2E_WEB_PORT:-3000}"
export PORT="$api_port"
export ALLOWED_ORIGINS="http://localhost:$web_port"
export PUBLIC_API_URL="http://localhost:$api_port"
export NEXT_PUBLIC_API_URL="http://localhost:$api_port"
export PUBLIC_WEB_URL="http://localhost:$web_port"
export E2E_API="http://localhost:$api_port"
export E2E_WEB="http://localhost:$web_port"
# A fresh address per run: login codes are rate limited per e-mail.
export E2E_EMAIL="e2e-$(date +%s)@exemplo.com"
export ADMIN_EMAILS="$E2E_EMAIL"
# The test pays its batches by hand (admin): no free tickets (ADR 0024).
export EXPORT_DIR="$out/exports"
# A throwaway master key: the e2e database holds test events only.
export TICKET_KEY_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
unset RESEND_API_KEY APP_ENV

cargo build --locked -p ingressoimpresso-server
pnpm --filter @ingressoimpresso/web run build

# Each server runs in its own session, so stopping it also stops what it spawned (pnpm starts
# next-server as a grandchild, which would otherwise keep the port after the test).
cleanup() {
    for pid in "${api_pid:-}" "${web_pid:-}"; do
        [ -n "$pid" ] && kill -- "-$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT

setsid ./target/debug/ingressoimpresso > "$out/api.log" 2>&1 &
api_pid=$!
setsid pnpm --filter @ingressoimpresso/web exec next start --port "$web_port" > "$out/web.log" 2>&1 &
web_pid=$!

for url in "http://localhost:$api_port/healthz" "http://localhost:$web_port/portaria"; do
    for _ in $(seq 1 60); do
        curl -fsS -o /dev/null "$url" && break
        sleep 1
    done
    curl -fsS -o /dev/null "$url" || { echo "not up: $url"; tail -50 "$out/api.log" "$out/web.log"; exit 1; }
done

E2E_API_LOG="$out/api.log" E2E_OUT="$out" node e2e/portaria.e2e.mjs
# The seller's link without internet (ADR 0074): reopening offline, the queue and its conflicts.
E2E_API_LOG="$out/api.log" E2E_OUT="$out" node e2e/vendedor.e2e.mjs
# The same production server: every page carries its CSP nonce (ADR 0048).
node e2e/csp.e2e.mjs
