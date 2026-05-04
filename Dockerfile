# Single-image quickstart: clones idf-host, installs deps, copies the
# entrypoint that bootstraps the `invest` domain on first start.
#
# Pinned to the latest commit on main at build time. Rebuild to refresh.
#
# Resulting image runs:
#   1. Express host on :3001
#   2. POST /api/typemap?domain=invest + /api/intents?domain=invest
#      (bootstrap of the demo domain) — once the host is up
#   3. tail -f the host log so the container stays attached

# ── stage 1: build ─────────────────────────────────────────────
FROM node:20-bookworm-slim AS build

# git нужен только для clone в build-stage. better-sqlite3 (host dep)
# требует python3 + make + g++ для native compilation.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# ARG позволит при необходимости pin'нуть конкретный commit:
#   docker build --build-arg IDF_REF=<sha> .
ARG IDF_REF=main
RUN git clone --depth 1 --branch ${IDF_REF} https://github.com/DubovskiyIM/idf.git \
 && cd idf \
 && rm -rf .git

WORKDIR /opt/idf
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# ── stage 2: runtime ──────────────────────────────────────────
FROM node:20-bookworm-slim

# curl в runtime — для healthcheck из docker compose.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/idf
COPY --from=build /opt/idf /opt/idf

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3001

# Default env — overridable.
ENV PORT=3001 \
    HOST_BOOT_TIMEOUT_SECS=30 \
    BOOTSTRAP_DOMAIN=invest

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD curl -fsS http://localhost:${PORT}/api/effects > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
