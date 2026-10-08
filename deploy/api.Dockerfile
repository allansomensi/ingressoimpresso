# API image (ADR 0013). Build context: repository root.
#   docker build -f deploy/api.Dockerfile -t ingressoimpresso-api .

FROM rust:1.97-bookworm AS build
WORKDIR /src
COPY . .
# Queries are checked against the committed .sqlx cache: no database needed at build time.
ENV SQLX_OFFLINE=true
RUN cargo build --release --locked -p ingressoimpresso-server \
    && cp target/release/ingressoimpresso /usr/local/bin/ingressoimpresso

FROM debian:bookworm-slim
# CA certificates: TLS to Neon and Resend.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /nonexistent app
COPY --from=build /usr/local/bin/ingressoimpresso /usr/local/bin/ingressoimpresso
USER app
ENV EXPORT_DIR=/tmp/ingressoimpresso-exports \
    RUST_LOG=info,sqlx=warn
EXPOSE 8080
CMD ["ingressoimpresso"]
