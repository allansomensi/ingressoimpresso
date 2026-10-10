# API image (ADRs 0013, 0019). Build context: repository root.
#   docker build -f deploy/api.Dockerfile -t ingressoimpresso-api .
#
# The Rust version matches rust-toolchain.toml, which .dockerignore leaves out so rustup does not
# download extra components during the build: bump both together. Dependencies are compiled in
# their own layer (cargo-chef), so a change to our code does not rebuild ~600 crates.

FROM rust:1.99.0-bookworm AS chef
RUN cargo install cargo-chef --version 0.1.78 --locked
WORKDIR /src

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS build
# Queries are checked against the committed .sqlx cache: no database needed at build time.
ENV SQLX_OFFLINE=true
COPY --from=planner /src/recipe.json recipe.json
RUN cargo chef cook --release --locked -p ingressoimpresso-server --recipe-path recipe.json
COPY . .
RUN cargo build --release --locked -p ingressoimpresso-server \
    && cp target/release/ingressoimpresso /usr/local/bin/ingressoimpresso

FROM debian:bookworm-slim
# CA certificates: TLS to Resend (sqlx bundles its own roots for Neon).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /nonexistent app
COPY --from=build /usr/local/bin/ingressoimpresso /usr/local/bin/ingressoimpresso
USER app
# Two malloc arenas: rendering threads otherwise keep ~90 MiB of freed memory (ADR 0015).
ENV EXPORT_DIR=/tmp/ingressoimpresso-exports \
    RUST_LOG=info,sqlx=warn \
    MALLOC_ARENA_MAX=2
EXPOSE 8080
CMD ["ingressoimpresso"]
