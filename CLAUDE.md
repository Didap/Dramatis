# Dramatis

Web app for writing novels and video game stories, inspired by bibisco. Italian (default) and English UI.

- **PRODUCT.md**: who it is for, what it promises, principles. The authority on product decisions.
- **DESIGN.md**: the visual system. The authority on how things look.
- **docs/product-spec.md**: information architecture, screens, flows, priorities (P0, P1, P2).
- **docs/BUILD.md**: who builds what in the first build, the contracts between areas, the rules.
- **docs/demo-format.md**: format of the demo projects in `server/content/demo/`.

## Stack and commands

Nuxt 4 (`app/` directory), Nuxt UI 4 (Tailwind 4, Reka UI, TipTap editor components), @nuxtjs/i18n 10,
Pinia, PostgreSQL 16 + Drizzle ORM, nuxt-auth-utils (email + password), zod 4, @vue-flow/core for graphs,
vue-draggable-plus for drag and drop. Package manager: pnpm.

```bash
pnpm db:up                 # Postgres in Docker (container dramatis-db, port 5435)
pnpm db:generate           # after editing server/db/schema.ts
pnpm db:migrate            # apply migrations (prints one line)
pnpm dev                   # http://localhost:3070
node scripts/dev-seed.mjs  # demo account demo@dramatis.local / dramatis-demo with a demo novel and a demo game
pnpm test                  # unit tests (vitest)
pnpm exec vue-tsc -b --noEmit 2>&1 | grep "error TS"   # typecheck, filtered
node scripts/smoke.mjs     # API end to end against the dev server
node scripts/page-check.mjs "/p/{novel}/characters" [--mobile] [--dark]   # a page in headless Chromium: errors + screenshot
node scripts/check-icons.mjs   # every i-lucide-* icon used exists
node scripts/check-contrast.mjs   # the palette in main.css passes WCAG AA (DESIGN.md "The Verified Rule")
node scripts/check-shortcuts.mjs  # ⌘K opens one search palette from the page, a field and the editor
node scripts/check-pages.mjs      # every page of both demo projects, desktop and phone (DRAMATIS_BASE_URL for another server)
```

Every check prints a few lines and exits with a code: read the outcome, not logs.

## Layout

```
app/
  pages/            index (landing), login, register, projects/, account, p/[projectId].vue (workspace shell) + p/[projectId]/*, print/[projectId]
  components/d/     shared building blocks, auto-imported as <D...>: RichText, EntityAvatar, ColorDot, ColorPicker,
                    StatusBadge, StatusSelect, EntityPicker, InlineText, PageHeader, EmptyState, ImageField, TagsInput,
                    Guide, ConfirmModal, SaveIndicator
  components/<feature>/   one folder per feature (characters, relations, manuscript, editor, timeline, flow, ...)
  stores/project.ts the open project (bundle) with optimistic mutations
  composables/      useTerms, useEnums, useFormat, useMediaUpload, useConfirm, useLeaveGuard, localDay
  utils/            errors (notifyError), status icons, editor-extensions (DialogueLine, SceneBreak)
server/
  db/schema.ts      the data model (read it first); migrations in db/migrations
  api/              auth, account, projects (+ generic collections CRUD), scenes content and revisions, trash, stats, media
  utils/            db (useDb, tables), auth (requireUser, requireProject), validation (zod schemas, parseBody),
                    collections (registry, assertRefs, trash/restore/purge), items (create/update), scenes, bundle, templates, demo
shared/
  types/            domain.ts (enums, jsonb shapes, RichDoc), entities.ts (row types, ProjectBundle, CollectionMap)
  utils/            constants (all fixed enumerations), richtext (plain text, word count, mentions), modules, time
  content/          profile.ts (character interview), structures.ts (story structure templates)
i18n/locales/<it|en>/<namespace>.json   one file per feature; the single top-level key is the namespace
```

## Data model rules

- Everything belongs to a project; the API checks ownership on every request (`requireProject`) and checks that every
  id an item points to belongs to the same project (`assertRefs`). Never trust ids from the client.
- Generic collections (`COLLECTIONS` in shared/utils/constants.ts) share one API:
  `POST /api/projects/:projectId/:collection`, `PATCH .../:collection/:id`, `DELETE .../:collection/:id`,
  `POST /api/projects/:projectId/reorder { collection, ids, partId?, chapterId? }`. Validation schemas live in
  `server/utils/validation.ts`; new fields need a schema change there and in `server/db/schema.ts`.
- Trash: everything deletable goes to the trash first (`deletedAt`; revisions too). Items trashed by one action
  share the same `deletedAt` (the batch) and come back together: a part with its chapters and scenes, a chapter
  with its scenes, a codex category with its entries, an entity with its images. Restoring an item whose place is
  gone puts it in a "Ripristinati" container. `POST .../trash/restore`, `.../trash/purge`, `.../trash/empty`;
  purge removes every reference (arrays, jsonb, relations, maps).
- Scene text lives in `scene_revisions`, not in the bundle: `GET .../scenes/:id/content` gives `revisionId` and
  `version`; `PUT` sends them back. When the revision was saved meanwhile (another device), the server stores the
  incoming text as a new inactive revision "Conflitto del ..." and answers 409 with both. The server keeps an
  automatic history (`.../snapshots`), computes words and characters, assigns dialogue line ids
  (`S014-L003`, from the scene's stable `code`) and records words written/removed per day in the account time zone.
- Long text fields (`LONG_TEXT_FIELDS`) carry versions (`versions` jsonb); the store sends `$base` automatically and a
  stale save comes back as `$conflicts` (the incoming text kept as a note). Profile answers are merged server-side.
- Rich text is TipTap JSON (`RichDoc`). Mentions are `mention` nodes with `id = "<refType>:<uuid>"` (use `mentionId`,
  `parseMentionId`, `extractMentions`). Script dialogue is `dialogueLine` (attrs speakerId, speakerName, direction, lineId).
- Scene tags: `scene.tags` maps `"<type>:<id>"` to `{ manual, mentions, lines }`; the server recomputes mentions and
  lines on every save and derives `characterIds`, `locationIds`, `objectIds`. The client only sends `manualTags`
  (the full list of manual tags). `strandIds` are manual.
- Images are the `images` collection (owner type and id, media, caption, alt, position; the first is the primary):
  `store.imagesOf(type, id)`, `store.primaryImage(type, id)`, `useMediaUpload().attach(file, owner)`.
- Group membership is a relationship of kind `membership` from the member to the group; valid kinds by pair and
  default directions are in `shared/utils/relations.ts`.
- Branching: `project.startSceneId`, `scene.ending` + `endingLabel`, choices are `links` with structured
  `conditions` and `effects` (variable ids). `analyseFlow` applies the implicit continuation.
- Positions order siblings (chapters within a part, scenes within a chapter). Reading order: `store.orderedChapters`,
  `store.orderedScenes`.
- Game features are modules (`resolveModules(kind, modules)`): branching, quests, variables, codex, dialogue. Novels
  have them off by default, games on; check `store.modules.<name>` before showing them.
- Custom endpoints never go in a folder named after a collection under `server/api/projects/[projectId]/` (a static
  folder hides the generic `[collection]` route for that name). `scenes/` is the one exception and has explicit
  handlers (`handleCreate`, `handleUpdate`, `handleDelete` in `server/utils/collection-routes.ts`). Use names such as
  `flow/`, `search.get.ts`, `export/`.

## Imports

Import shared code explicitly, in app and server code alike:
`import { SCENE_STATUSES } from '#shared/utils/constants'`, `import { richToPlainText } from '#shared/utils/richtext'`,
`import type { Scene } from '#shared/types/entities'`. Auto-import misses identifiers used as `(NAME as Type)` and the
failure only shows at runtime (`NAME is not defined`). Nuxt, Nitro and Nuxt UI composables (`useDb`, `requireProject`,
`useProjectStore`, `useToast`...) and components stay auto-imported.

## Client rules

- Read and write project data through `useProjectStore()`: `create`, `update` (optimistic, rolls back on failure),
  `patchSoon` (typing: debounced and merged), `remove` (trash with undo toast), `reorder`, `updateProject`,
  `updateProjectSoon`. After a custom endpoint, sync with `patchLocal` / `upsertLocal` / `removeLocal`.
- Lookups: `store.get(collection, id)`, `store.refLabel(ref)`, `store.refPath(ref)`, `store.worldEntities`.
- Words that change with the medium (Part/Act, Manuscript/Script, Notes/Codex) come from `useTerms().term(key, count)`.
- Enum labels and select options: `useEnums().label(name, key)` / `.options(name)`. Numbers, words and dates:
  `useFormat()`. Errors from `$fetch`: `notifyError(error)`.
- No hard-coded copy: every string goes through i18n, in both `it` and `en`, in the feature's own namespace file.
  In messages `{ } @ $ |` are special: `|` only for plurals, never `@`. No em dashes in UI copy.
- Colours of entities are the twelve `ENTITY_COLORS` (CSS variables `--entity-<key>`), statuses are `--status-<key>`;
  a colour is never the only signal (always a name, a label or an icon next to it).
- Accessibility: WCAG 2.2 AA. Every drag and drop has a keyboard alternative; icon-only buttons have an aria-label;
  focus stays visible; touch targets at least 44px on phones.
- Phones are first-class: check every page with `page-check --mobile`.

## Design rules (DESIGN.md is the authority)

- "Il Libretto": the author's words in the manuscript face (`voice-author` class, Literata), the app's words in the UI
  face (Schibsted Grotesk). Rows, not cards (`DRow`), the dotted leader (`DLeader`) where a name meets a number.
- Tokens live in `app/assets/css/main.css` and `app/app.config.ts`; use Nuxt UI semantic classes (`text-muted`,
  `bg-elevated`, `border-default`...), never raw colours. Every workspace page is wrapped in `DPage`.
