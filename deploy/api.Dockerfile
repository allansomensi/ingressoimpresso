# API image (ADRs 0013, 0019). Build context: repository root.
#   docker build -f deploy/api.Dockerfile -t ingressoimpresso-api .
#
# The Rust version matches rust-toolchain.toml, which .dockerignore leaves out so rustup does not
# download extra components during the build: bump both together. Dependencies are compiled in
# their own layer (cargo-chef, prebuilt in its official image: compiling it from source cost a
# couple of minutes on every cold build), so a change to our code does not rebuild ~600 crates.
#
# Both images are pinned by digest (ADR 0047): a tag can be moved to other contents, a digest
# cannot, and this image compiles the binary that signs tickets. Dependabot proposes the new
# digest of a tag; a new tag (another Rust) is a change made by hand, with rust-toolchain.toml.

FROM lukemathwalker/cargo-chef:latest-rust-1.99.0-bookworm@sha256:2ee6e8edf0b91b5a7295071299596601710bccb243bd9735e0b9abf6e114582b AS chef
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

FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8
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
