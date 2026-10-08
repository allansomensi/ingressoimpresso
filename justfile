# Ingresso Impresso: single entry point for Rust + WebAssembly + web.
# Run `just` (or `just check`) before every commit: it is exactly what CI runs.

set shell := ["bash", "-euo", "pipefail", "-c"]

wasm_target := "wasm32-unknown-unknown"
wasm_out := "packages/ticket-core-wasm/pkg"

# Everything CI runs, in order.
default: check

check: fmt-check clippy test-rust generated-check wasm js-install js-check

# --- Rust -------------------------------------------------------------------

fmt:
    cargo fmt --all

fmt-check:
    cargo fmt --all -- --check

clippy:
    cargo clippy --workspace --all-targets --all-features -- -D warnings
    cargo clippy -p ticket-wasm --target {{wasm_target}} -- -D warnings

# Also regenerates the ts-rs bindings (feature `ts`).
test-rust:
    cargo test --workspace --all-features

# Regenerates the shared test vectors. Only for an intentional format/spec change: review the diff.
vectors:
    cargo run -q -p ii-cli -- vectors generate --out testdata/vectors/ticket-v1.json

# Fails if generated files (TS bindings, vectors) are not committed up to date.
generated-check:
    cargo run -q -p ii-cli -- vectors check --path testdata/vectors/ticket-v1.json
    git diff --exit-code -- packages/ticket-core-wasm/src/generated testdata/vectors
    untracked="$(git ls-files --others --exclude-standard -- packages/ticket-core-wasm/src/generated)"; \
        if [ -n "$untracked" ]; then echo "untracked generated files:"; echo "$untracked"; exit 1; fi

# --- WebAssembly ------------------------------------------------------------

# Builds ticket-wasm and generates the JS glue into packages/ticket-core-wasm/pkg.
wasm:
    cargo build -p ticket-wasm --target {{wasm_target}} --profile release-wasm
    wasm-bindgen --target web --out-dir {{wasm_out}} --out-name ticket_core \
        target/{{wasm_target}}/release-wasm/ticket_wasm.wasm
    @ls -l {{wasm_out}}/ticket_core_bg.wasm | awk '{print "ticket_core_bg.wasm: " $5 " bytes"}'

# --- JavaScript / web ---------------------------------------------------------

js-install:
    pnpm install --frozen-lockfile

js-check:
    pnpm -r run typecheck
    pnpm -r run lint
    pnpm -r run test
    pnpm --filter @ingressoimpresso/web run build

# --- Local development --------------------------------------------------------

# Local Postgres for the API (phase 3 onwards).
db-up:
    docker compose -f deploy/compose.dev.yaml up -d

db-down:
    docker compose -f deploy/compose.dev.yaml down

web-dev:
    pnpm --filter @ingressoimpresso/web run dev
