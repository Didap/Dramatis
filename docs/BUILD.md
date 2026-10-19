# Build brief: the first build of Dramatis

Eleven feature agents build the workspace in parallel on the foundation that is already in place
(data model, API, store, shell, shared components, design tokens). Read, in this order:
`CLAUDE.md` (stack, rules, commands), `PRODUCT.md`, `DESIGN.md`, `docs/product-spec.md` sections 0, 1,
2 and **the sections of your area**, then the code you build on (`server/db/schema.ts`,
`shared/types/*`, `shared/utils/*`, `app/stores/project.ts`, `app/components/d/*`).

The product spec is the authority on what to build, DESIGN.md on how it looks, this file on who builds
what. P0 must ship; P1 if time allows, in the order listed; never start a P2 item.

## The foundation (do not rewrite it)

- **Data**: `server/db/schema.ts` and `server/utils/validation.ts` are frozen for this build. Every
  collection has a `meta` jsonb for small extra data; if you truly need a column, write it in your final
  report instead of changing the schema.
- **API**: generic CRUD for every collection (`COLLECTIONS`), reorder, trash (list, restore, purge,
  empty), scene content (`GET/PUT .../scenes/:id/content`, with `revisionId` + `version`, 409 on
  conflict with the incoming text saved as a conflict revision), revisions (`.../revisions`, trash,
  activate), history (`.../snapshots`, restore), stats (`.../stats?days=`), media upload, project
  create (blank, `structure` template), demo, opened, restore, delete (`?forever=1`), account
  `GET/PATCH /api/account`. Read the handlers before writing your own.
- **Store** (`useProjectStore`): `rows.<collection>`, `get`, `refLabel`, `refPath`, `imagesOf`,
  `primaryImage`, `worldEntities`, `orderedChapters`, `orderedScenes`, `chapterScenes`, `totalWords`;
  `create`, `update`, `patchSoon` (typing), `remove` (trash + undo), `restore`, `reorder`,
  `updateProject`, `updateProjectSoon`, `patchLocal`/`upsertLocal`/`removeLocal`. Long text fields
  automatically carry their base version and conflicts come back as notes with a toast. Use the store;
  do not keep your own copy of project data.
- **Shell** (`app/pages/p/[projectId].vue`): sidebar, phone bar, capture drawer, "Altro", command
  palette mount, shortcuts (`⌘K`, `?`, `⌘\`), refetch on focus. Your pages render inside it.
- **Shared components** (`app/components/d/`, `<D...>`): `DPage` (every workspace page: title, back,
  width, actions slot), `DPageHeader`, `DRow` (list rows with the leader), `DLeader`, `DEntityAvatar`
  (portrait for characters, square with icon for others), `DEntityImage` (primary image),
  `DImageGallery`, `DRichText` (TipTap with @ mentions), `DInlineText`, `DEntityPicker`,
  `DStatusBadge`, `DStatusSelect`, `DColorDot`, `DColorPicker`, `DTagsInput`, `DGuide`, `DEmptyState`,
  `DSaveIndicator`, `DConfirmModal` (via `useConfirm()`).
- **Composables**: `useTerms` (medium vocabulary), `useEnums`, `useFormat`, `useFlow`
  (`shared/utils/flow.ts`), `useProjectNav`, `useMediaUpload`, `useConfirm`, `useLeaveGuard`,
  `localDay`. Utilities: `notifyError`, `statusIcon`, `REF_ICONS`, `SCENE_KIND_ICONS`, `SECTION_ICONS`,
  `DialogueLine`, `SceneBreak`, `newLineId`.
- **Placeholders**: every route of spec 1.5 exists as a stub page; replace the ones you own.

## Contracts between areas

These components are used by several areas. A stub already exists with the final props; its owner
replaces the body, everyone else may embed it right away.

| component | props | owner | embedded by |
|---|---|---|---|
| `<RelationsPanel>` (`components/relations/Panel.vue`) | `entityType`, `entityId` | relations | characters, world |
| `<ManuscriptAppearances>` (`components/manuscript/Appearances.vue`) | `entityType` (character, location, object, group, strand), `entityId` | manuscript | characters, world, architecture (strands) |
| `<TimelineEntityEvents>` (`components/timeline/EntityEvents.vue`) | `entityType`, `entityId` | timeline | characters, world |
| `<FlowSceneChoices>` (`components/flow/SceneChoices.vue`) | `sceneId` | flow | editor (scene details) |
| `<SearchPalette>` (`components/search/Palette.vue`) | `v-model:open` | search | shell |

Group membership is a relationship of kind `membership` from the member to the group
(`shared/utils/relations.ts` has the valid kinds by pair and the default directions).

## Rules for everyone

1. **Own your files.** Create and edit only the files listed for your area, plus new files inside your
   own folders. Never edit another area's files or the foundation; if the foundation has a bug or lacks
   something, work around it locally and describe the fix in your final report.
2. **Copy** goes in your namespace files `i18n/locales/{it,en}/<namespace>.json` (single top-level key =
   the namespace), both languages, natural Italian and English, no em dashes, `|` only for plurals,
   never `@` in messages. Medium words come from `useTerms()`; enum labels from `useEnums()`.
3. **Imports**: shared code explicitly from `#shared/...` (see CLAUDE.md "Imports").
4. **Design**: follow DESIGN.md. The two voices (`voice-author` class for what the author wrote),
   rows not cards, the leader where a name meets a number, one solid primary per view, statuses as icon
   plus label, colours always with a name, empty states that teach (spec section 4 has the copy).
   Product register: familiar, calm, precise. No modals except confirmations that destroy something.
5. **Accessibility**: WCAG 2.2 AA; every drag has a keyboard and menu alternative (`Alt+Up/Down`,
   "Sposta in..."); icon-only buttons have `aria-label`; 44px touch targets on phones.
6. **Phones**: below 1024px the shell is the phone layout. Every page must work at 390px wide.
7. **Server code** you add goes in your listed files; validate input with zod (`parseBody`,
   `parseQuery`), check ownership with `requireProject`, references with `assertRefs`. Never put a
   folder named after a collection under `server/api/projects/[projectId]/`.
8. **Do not** install packages, run `nuxt prepare`, `drizzle-kit`, `db:migrate`, or
   `dev-seed --fresh` (other agents use the same database and the same demo projects). Create your own
   test data through the API or the UI. The dev server is already running on port 3070.
9. **Verify** before you finish:
   - `pnpm exec vue-tsc -b --noEmit 2>&1 | grep "error TS" | grep -E "<your folders>"`: no errors in
     your files (other areas may be mid-work; ignore their errors).
   - `node scripts/page-check.mjs "<path>"` and `--mobile` (and `--dark` once) for each of your pages:
     zero errors; open the screenshot with Read and look at it critically against DESIGN.md. Use
     `--action` to exercise the main interaction (click, fill, press).
   - `node scripts/check-icons.mjs` (every icon exists).
   - For server endpoints, a quick `curl` or node check with the demo account
     (`demo@dramatis.local` / `dramatis-demo`).
10. **Final report** (your last message, at most 40 lines): what you built (P0/P1 done), what is
    missing or partial, files created, any foundation fix you need, and how you verified.

Page-check paths accept tokens: `{novel}`, `{game}`, `{novel.character}`, `{game.scene}`, ...

## Areas

### A1. Characters (namespace `characters`)
Files: `app/pages/p/[projectId]/characters/**`, `app/components/characters/**`.
- List (spec 4.4 Characters): grouped by importance (`common.enums.importancePlural`), rows with
  portrait, name, epithet (tagline), scene count, planning status; text filter on names and aliases;
  filters by role, group (membership relations), free tags (categories); sort manual, name,
  appearances; inline create (name + importance; the first character is `main`); reorder within a
  group (drag + `Alt+Up/Down` + menu); trash. From `xl` list and sheet side by side (nested route
  `characters.vue` parent is allowed inside your folder).
- Sheet: header (`DEntityImage`, name inline, aliases, importance, role, status, tagline 140, colour,
  tags; game: "Giocabile"); profile sections for `main` with progress ("5 di 8 risposte") linking to
  section pages; description for `secondary` and `minor`; `voice` section for every importance in
  game projects (spec 7.6); traits (qualities, flaws, contradictions: three short ordered lists);
  `RelationsPanel`; groups (membership relations, with role as the label; add and remove);
  `ManuscriptAppearances`; `TimelineEntityEvents`; `DImageGallery`; notes (`DRichText`). Teaching
  empty pieces from spec 4.4.
- Profile section page `characters/[characterId]/[section]`: mode switch Intervista / Testo libero
  (both kept), questions from `shared/content/profile.ts` + `profile.json` (question = UI voice, answer =
  author voice, growing plain-text fields saved with `patchSoon` on `profile.<section>.answers.<key>`),
  hints when guidance is on, free text with `DRichText`, the note when the other mode has content,
  previous and next section; phone: questions stacked, prev/next fixed at the bottom.
- P1: "Usa le risposte come traccia"; lines and words spoken (module `script`) via a new endpoint
  `server/api/projects/[projectId]/dialogue/lines.get.ts` (use `extractDialogueLines`).

### A2. World: groups, locations, objects, world hub (namespaces `groups`, `locations`, `objects`, `world`)
Files: `app/pages/p/[projectId]/{groups,locations,objects}/**`, `app/pages/p/[projectId]/world.vue`,
`app/components/{groups,locations,objects,world}/**`.
- Groups (vocabulary: Fazioni in games): list (rows, colour dot + name, kind, members count, status),
  create, reorder, trash; sheet: kind, status, colour, description, language, traditions, powers (rich
  text each), members (membership relations: characters with role = label, locations, objects; add,
  remove, edit role), `DImageGallery`, relationships with other groups (`RelationsPanel`).
- Locations: list (P1 grouped by nation and region), create, reorder, trash; sheet: nation, region,
  city, kind, status, description, images, significant events (`TimelineEntityEvents`), the scenes set
  there (`ManuscriptAppearances`), the characters linked by `place` (`RelationsPanel`).
- Objects (Items in English games): list, sheet with kind, status, description, images, events, owners
  (`ownership` relations), the scenes where it appears.
- World hub `world.vue` (the phone "Mondo" tab, spec 4.4): Characters first (opens on them), then
  Groups, Locations, Objects, Relations, Codex (module) as rows with counts and the last edited item.

### A3. Relations and maps (namespace `relations`)
Files: `app/pages/p/[projectId]/relations/**`, `app/components/relations/**` (including `Panel.vue`).
- Relationships are global (`relations` collection); kinds valid by pair (`relationKindsFor`, swap
  when the pair is listed the other way), label, reverse label, mutual or directed (default from the
  kind), description; create, edit, trash.
- `relations/index.vue`: maps list + the **Elenco** tab, the full accessible alternative (filter by
  entity, kind; edit in a slideover). `relations/[mapId].vue`: the map with Vue Flow (DESIGN.md
  "Relationship map": nodes coded by shape, edges by kind colour and dash family, labels on pills,
  arrows for directed, followspot selection, legend that filters); nodes = the map's `nodes` keys with
  positions; add nodes (picker), remove from map (never deletes the entity); link by dragging between
  nodes and by "Collega a..."; positions saved with `patchSoon` on the map; nodes at 0,0 (the demo map)
  get an automatic layout (d3-force) on first open, then saved. Keyboard: Tab through nodes, Enter opens
  the relationship slideover. Phone: view only, editing through the list.
- `<RelationsPanel entityType entityId>`: the relationships of one entity ("Tobia, padre"), add (kind
  filtered by pair), edit, trash, "Mostra nella mappa".
- P1: "+N relazioni fuori mappa" with "Aggiungi i collegati"; arrow-key node moves.

### A4. Manuscript structure (namespace `manuscript`)
Files: `app/pages/p/[projectId]/manuscript/index.vue`, `app/pages/p/[projectId]/manuscript/chapters/**`,
`app/components/manuscript/**` (including `Appearances.vue`),
`server/api/projects/[projectId]/manuscript/**`.
- Outline (spec 4.5): optional parts (acts) per `project.settings.parts` (default games yes, novels
  no), chapters (title, purpose, notes), scenes (title, synopsis, status, kind icon with `scene_kinds`,
  POV character, words); drag and drop (vue-draggable-plus) to reorder scenes, move scenes between
  chapters and chapters between parts, plus `Alt+Up/Down` and "Sposta in..."; inline rename and status;
  words per scene, chapter, part and total with the leader; automatic first chapter; open a scene in the
  editor (`/manuscript/scenes/:id`). No corkboard (out of scope).
- Chapter page `manuscript/chapters/[chapterId]`: title, purpose, notes, its scenes; the reading view
  (scene texts in sequence, read-only, fetched per scene).
- `server/api/projects/[projectId]/manuscript/parts.post.ts`: turning parts on (every chapter into a new
  "Parte prima" / "Atto I") and off (chapters keep their order, parts go to the trash in one batch) per
  spec 7.15; the settings page calls it.
- `<ManuscriptAppearances entityType entityId>`: scenes where the entity appears (tags, POV character,
  strand, group members' scenes), in reading order grouped by chapter, with "compare per la prima volta
  nel capitolo 2".
- P1: multi-select of scenes; outline filters (status, character, strand); duplicate a scene.

### A5. Scene editor (namespace `editor`)
Files: `app/pages/p/[projectId]/manuscript/scenes/**`, `app/components/editor/**`,
`app/composables/useSceneContent.ts`.
- Everything in spec 4.5 (scene editor), 5.3, 5.6, 5.7, 5.8, 5.11 and section 6 "Scene editor" P0:
  UEditor writing surface (bold, italic, underline, strikethrough, quote, lists, scene break, alignment),
  bubble menu, `/` menu, `@` mentions (characters, locations, objects, groups, codex entries) with the
  mention card on hover/tap; dialogue punctuation buttons per `settings.dialogueStyle`; smart typography
  per `settings.smartTypography` and the manuscript language; spell check in the project language;
  words and characters (with and without spaces) and session words; autosave (1s after the last
  keystroke, at least every 10s) with the pending text in IndexedDB or localStorage until confirmed,
  retries with backoff, the conflict message with "Usa la mia versione" (activates the conflict
  revision); the details panel (`⌘J`; desktop docked, phone drawer): title, synopsis (500), status
  (segmented control), kind, POV and POV character, tags with their source (manual, mentioned,
  speaks) and manual add/remove (`manualTags`), strands, story time (precision year/month/day/minute,
  label, duration value + unit), notes, ending + label and "Scena iniziale" (`project.startSceneId`)
  with `branching`, `<FlowSceneChoices>` with `branching`; revisions (create, rename, use, trash);
  history with restore; find and replace in the scene (`⌘F`); focus mode (`⌘⇧Enter`, `Esc`) with
  paragraph focus and typewriter scrolling; typography menu "Aa" saved to account preferences; paste
  cleanup; the `dialogueLine` block with a node view (speaker picker or free label, direction, line,
  alternating speakers on Enter, lineIds applied from the save answer) with module `script`; previous
  and next scene; phone keyboard toolbar (B, I, «», @, Battuta, Scelta); chrome that fades while typing.
- P1: compare revisions; "Solo dialoghi"; selection word count.

### A6. Architecture, strands, notes, codex (namespaces `architecture`, `strands`, `notes`, `codex`)
Files: `app/pages/p/[projectId]/{architecture,strands,notes,codex}/**`,
`app/components/{architecture,strands,notes,codex}/**`.
- Architecture index (three rows with planning status, word count, first two lines; links to strands
  and notes) and `architecture/[part]` (premise, fabula, setting: manuscript typography, status, word
  count, `DGuide` collapsed when guidance is on, empty copy of spec 4.3). Statuses are
  `project.premiseStatus` etc.
- Strands (vocabulary: Trame e missioni in games): list (swatch + colour name, title, kind, status,
  scenes count; kind filter; new; reorder; trash) and sheet (title, kind, colour, status, description,
  scenes via `ManuscriptAppearances`; `arc`: the character; `quest` and `side_quest` with module
  `quests`: giver, objectives ordered with optional flag and completing scene and the computed check,
  rewards with optional object).
- Notes: list (title, first line, last edited; pinned P1), note page (title + `DRichText`), new,
  reorder, trash. Conflict notes created by the server are ordinary notes.
- Codex (module `codex`): categories (seven defaults exist in games) with create, rename, reorder,
  trash; entries per category (title, body with mentions), entry page; `?category=` filter.

### A7. Timeline and analysis (namespaces `timeline`, `analysis`)
Files: `app/pages/p/[projectId]/timeline.vue`, `app/pages/p/[projectId]/analysis.vue`,
`app/components/{timeline,analysis}/**` (including `timeline/EntityEvents.vue`).
- Timeline (spec 4.5, 6): events (story or historical, story start, date label, duration, description,
  links to characters, locations, objects, groups) with create, edit in a slideover (`?event=`), trash;
  the chronological list of dated scenes and events (`compareStoryTime`), grouped by year/month/day,
  filters (character, location, strand, kind); the undated tray; giving a scene a date inline.
  P1: overlap warnings; narrative order beside story order.
- `<TimelineEntityEvents entityType entityId>`: the events linked to an entity, with add.
- Analysis (`?tab=`): chapter lengths; characters, locations, objects and strands by chapter (matrix,
  a cell opens its scenes); POV and POV character by chapter; status by chapter. HTML and CSS only,
  numbers always visible (DESIGN.md "Charts"). P1: the game tab.

### A8. Game flow and variables (namespace `flow`)
Files: `app/pages/p/[projectId]/flow.vue`, `app/pages/p/[projectId]/variables.vue`,
`app/components/flow/**` (including `SceneChoices.vue`).
- Spec 5.5 and section 6 "Game modules": choices (`links`) with text (300), structured condition (mode
  all/any; clauses of variable, operator by type, value), ordered effects (operation by type), order
  among a scene's choices; start scene; endings with label; the implicit continuation
  (`shared/utils/flow.ts`, `useFlow()`); the flow graph (`?view=graph`: Vue Flow, acts as bands, nodes
  per DESIGN.md "Game flow graph", positions saved in `scene.flowPosition`, drag to link), the list view
  and the checks view (unreachable, dead ends, unreachable endings, broken links, missing start or
  ending, variables never used or never changed).
- `<FlowSceneChoices sceneId>`: outgoing choices (add, edit, reorder, trash, target picker) and incoming
  ones, for the scene editor.
- Variables page: create, edit, reorder, trash; name rule; type; default; description; where used.

### A9. Overview, goals, search, trash, settings, account (namespaces `overview`, `goals`, `search`, `trash`, `settings`, `account`)
Files: `app/pages/p/[projectId]/{index,goals,search,trash,settings}.vue`, `app/pages/account.vue`,
`app/components/{overview,goals,search,trash,settings,account}/**` (including `search/Palette.vue`),
`server/api/projects/[projectId]/path.get.ts`, `server/api/projects/[projectId]/search.get.ts`,
`server/api/account/password.post.ts`, `server/api/account/index.delete.ts`.
- Path endpoint (spec 3: stages, done, fraction, reason, per medium and modules; uses `analyseFlow`
  and `export_log`); overview (spec 4.2: resume, the path card with the leader per DESIGN.md, today,
  deadline line, recent items, flow line); goals (targets, progress, 30/90-day history as bars and
  table with words written and removed, monthly averages, trend, projected finish).
- Command palette (`⌘K`: sections, entities by name and alias, actions, scene text through the search
  endpoint), the search page (`?q=`, `⌘⇧F`), search in profile answers too.
- Trash page (batches grouped, restore, delete forever, empty trash with an inline confirmation).
- Project settings (general, type and modules with `variables` implying `branching`, writing:
  dialogue punctuation, smart typography, chapter numbering, scene separator; structure: parts on/off
  through A4's endpoint; guidance; delete project to the trash).
- Account page (name, password change with the current password, language, theme, timezone, editor
  typography defaults, guidance default, delete account with typed email after offering the backup).

### A10. Export, import, print (namespace `export`)
Files: `app/pages/p/[projectId]/export.vue`, `app/pages/print/**`, `app/components/export/**`,
`server/api/projects/[projectId]/export/**`, `server/api/projects/import.post.ts`,
`server/utils/export/**`.
- Spec 5.10, 7.24, 7.25 and section 6 "Export and import": manuscript as DOCX (`docx`), PDF (the print
  page `/print/[projectId]` with `@page` CSS, two layouts: manuscript and book), EPUB 3 (`fflate`), TXT;
  the project document as DOCX (story bible / narrative design document); JSON, Twee 3 (Harlowe 3),
  Ink, voice-over CSV (line id, scene code, speaker, line, direction); project backup (.zip with one
  JSON and the image files) and its import as a new project, lossless (scene codes and line ids kept);
  every export recorded in `export_log` with `allFinal` and `flowClean`.

### A11. Landing, sign-in, projects (namespaces `landing`, `auth`, `projects`)
Files: `app/pages/index.vue`, `app/pages/login.vue`, `app/pages/signup.vue`,
`app/pages/projects/**`, `app/layouts/**`, `app/components/{landing,auth,projects}/**`.
- Landing (brand register, spec 4.1; calm and literary, no SaaS template, real typography, phone
  first), sign in and sign up (`POST /api/auth/login|register`, timezone from the browser, min 10
  characters, errors inline, after sign-in open `preferences.lastProjectId` or `/projects`), the
  projects list (rows, not cards; deleted filter with restore and delete forever; import a backup via
  A10's endpoint; open a demo) and the new project dialog (desktop) / drawer (phone): title, type,
  start from (blank, a structure template of the type with its shape, the demo); `?new=1` opens it.
