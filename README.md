# Dramatis

Dal primo spunto al manoscritto finito, con tutto il mondo della storia in ordine.

Dramatis is a web app for writing novels and the stories of video games. It follows bibisco's method
(architecture, characters, world, chapters and scenes, analysis, export), rebuilt as a modern,
responsive workspace whose data follows the author from desk to phone. Italian and English.

- What it is for and for whom: [PRODUCT.md](PRODUCT.md)
- How it looks: [DESIGN.md](DESIGN.md) ("Il Libretto")
- What it does, screen by screen: [docs/product-spec.md](docs/product-spec.md)
- How the code is organised and the rules: [CLAUDE.md](CLAUDE.md)

## Run it locally

Requirements: Node 22.21+ or 24.11+, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env            # then set NUXT_SESSION_PASSWORD to a random 32+ character string
pnpm db:up                      # Postgres 16 in Docker on port 5435
pnpm db:migrate
pnpm dev                        # http://localhost:3070
node scripts/dev-seed.mjs       # optional: demo@dramatis.local / dramatis-demo with a demo novel and a demo game
```

## Checks

Each prints a few lines and exits with a code.

```bash
pnpm exec vue-tsc -b --noEmit 2>&1 | grep "error TS"   # types
pnpm test                                              # unit tests
node scripts/smoke.mjs                                 # the API end to end
node scripts/check-pages.mjs                           # every page, desktop and phone
node scripts/check-contrast.mjs                        # the palette against WCAG AA
node scripts/check-icons.mjs                           # every icon exists
```

## Deploy

`pnpm build` produces a Node server in `.output/`. It needs `DATABASE_URL` and
`NUXT_SESSION_PASSWORD` at runtime; run `node scripts/migrate.mjs` before starting
`node .output/server/index.mjs`. Images are stored in the database.

The `Dockerfile` does all of this: the container applies pending migrations, then serves on port 3000.
Production runs on Coolify (project Dramatis, https://dramatis.didap.it), built from `main`, on the
shared Postgres of the `shared-infra` project with a role and a database of its own (`dramatis`). On a
shared server, `DATABASE_ADMIN_URL` (a superuser of that server) lets the first start create the role and
the database named in `DATABASE_URL`; remove it afterwards.
