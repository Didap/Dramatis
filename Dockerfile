# Dramatis: Nuxt 4 server for Coolify (or any Docker host).
#
#   builder: installs every dependency and runs `nuxt build`
#   runner:  the self-contained .output, plus the migrator (two packages, the SQL files, the script)
#
# At start the container applies pending migrations, then serves on :3000.
# Runtime variables: DATABASE_URL, NUXT_SESSION_PASSWORD (32+ characters); on a shared Postgres server
# DATABASE_ADMIN_URL for the first start only (see scripts/migrate.mjs).

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
RUN corepack enable
ENV NUXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=3072

# Coolify passes NODE_ENV=production to the build, which would skip the devDependencies the build needs
# (icon collection, types). Scripts wait until the sources are in place.
COPY package.json pnpm-lock.yaml ./
RUN NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm exec nuxt prepare && pnpm build


FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NUXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000

# Same versions as pnpm-lock.yaml, so the migrator reads the migrations the way drizzle-kit wrote them.
RUN echo '{"private":true}' > package.json \
 && npm install --omit=dev --no-audit --no-fund drizzle-orm@0.45.4 postgres@3.4.9 \
 && npm cache clean --force

COPY --from=builder /app/.output ./.output
COPY server/db/migrations ./server/db/migrations
COPY scripts/migrate.mjs ./scripts/migrate.mjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["sh", "-c", "node scripts/migrate.mjs && exec node .output/server/index.mjs"]
