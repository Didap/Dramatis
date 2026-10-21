# Dramatis: product specification

Version 1, 18 October 2026. Owner: William (product). Authority above this document: `/Users/w/Dramatis/PRODUCT.md`.

This is the brief for the first build. About nine engineering agents implement it in parallel, so every rule that two agents could otherwise decide differently is decided here. Where this document says P0, it ships in this build. P1 ships if time allows. P2 is later and must not be started.

Reading order: section 0 (the decisions that hold the build together), then the section that covers your area, then section 7 (data) for every entity you touch.

---

## 0. Decisions that hold the build together

1. **One story, stored once.** A character, location, object, group, strand, codex entry or event exists once. Scenes, relationships, the timeline, analysis and exports all point to it by id. Names are never copied into other records except as a fallback label (see mentions).
2. **Relationships are global facts; maps are views.** A relationship between A and B is one record. A relation map is a named set of nodes with positions; it shows every relationship that exists among its nodes. Drawing an edge on a map creates a global relationship. Removing a node from a map never deletes the entity or its relationships.
3. **Group membership is a relationship** of kind `membership` whose target is the group. The group sheet's member list and the character sheet's "Gruppi" list are both read from these relationships. There is no separate membership table.
4. **Tagging is a by-product of writing.** A scene tag (character, location, object) records three sources: added by hand (`manual`), mentioned in the text (`mention`, a count), speaking in a dialogue line (`dialogue`, a count). It exists while any source is set. On every save the server recomputes the two counts from the active revision. Removing a tag by hand clears only `manual`, so a tag still mentioned or speaking stays; nothing ever removes a manual tag automatically.
5. **Never lose a word.** Autosave with a visible state; the client keeps unsaved text locally until the server confirms; every save carries the version it was based on; if the server has a newer version (another device or tab), the incoming text is kept beside the other, never written over it (a new revision for a scene, a note for any other long text; section 5.11). Automatic snapshots keep earlier states of every revision. Everything deletable goes to the trash first.
6. **Hiding is not deleting.** Demoting a character, switching a module off, changing the project type, turning parts off: the data stays and comes back when the setting comes back. Only "Elimina definitivamente" in the trash and account deletion destroy data.
7. **Vocabulary follows the medium.** Every term that changes between novel and game (section 2) is resolved through one medium-aware i18n helper with the keys given in section 2. No component hard-codes "Parte", "Manoscritto" or their English equivalents.
8. **Game flow has an implicit backbone.** In a project with branching on, a scene with no outgoing choices that is not an ending continues to the next scene in manuscript order. The flow view draws this as a dashed edge, reachability follows it, and exports emit it as a plain link or divert. A scene with at least one explicit choice has no implicit continuation.
9. **Conditions and effects are structured data**, never free-text expressions: clauses of variable, operator and value; effects of variable, operation and value. This is what makes the Ink, Twee and JSON exports deterministic.
10. **Stable codes for the team.** Every scene gets a code (`S001`, `S002`...) at creation; every dialogue line gets an id derived from it (`S014-L003`). Codes never change and are never reused, including after reordering, moving or trashing. Duplicates created by copy and paste are reassigned by the server on save.
11. **One word counter.** Words are whitespace-separated tokens containing at least one letter or digit (so "l'amico" is one word, a lone "—" is none). Characters are counted with and without spaces. The same shared function runs on client and server. Dialogue lines count their line text, not speaker or direction.
12. **Daily words mean words written.** Each editor save records the word delta of that revision. Words written today is the sum of the positive deltas; words removed is the sum of the negative ones. Imports, restores, template and demo creation do not count. Days follow the timezone in the account settings.
13. **Charts are HTML and CSS.** Analysis and goals use styled tables and bars, each with numbers visible, no chart library. Colour is never the only signal: every status, kind and colour carries a label or an icon.
14. **Every drag has an alternative.** Reordering, moving scenes between chapters, linking nodes on a map or in the flow: each has a menu and keyboard path (move up, move down, move to chapter, "Collega a...").
15. **Routes carry no locale prefix.** The UI language comes from the account setting (a cookie before sign-in, from the browser on first visit). Italian is the default.
16. **No AI anywhere.** No generation, no suggestions, no summaries written by a model. Nothing written by the author leaves the server except in an export the author asked for.

### Conventions

- **Enumerations.** Use exactly the keys listed in the brief; labels are in section 2. Planning status (`todo`, `progress`, `done`) is used by characters, locations, objects, groups, strands and also by the three architecture pages (premise, fabula, setting), as in bibisco.
- **Modules.** Six keys: `branching` (choices, start scene, endings, flow view and checks), `variables` (state variables, conditions and effects; switching it on also switches on `branching`, and switching `branching` off also switches it off), `quests` (strand kinds `quest` and `side_quest` with giver, objectives, rewards), `codex` (lore codex), `script` (dialogue lines in scenes and the voice-over CSV), `scene_kinds` (the game scene kind field). Game projects start with all six on. Novel projects start with all off.
- **Breakpoints.** Below `lg` (1024 px) the project uses the phone layout: bottom bar, drawers, single pane. From `lg` the sidebar is visible and collapsible. From `xl` (1280 px) entity sections show list and detail side by side.
- **Locale formatting.** Numbers, dates and counts through `Intl` in the UI language: "1.240 parole", "18 ott 2026"; "1,240 words", "Oct 18, 2026".
- **Shortcuts (P0).** `Cmd/Ctrl+K` command palette; `Cmd/Ctrl+F` find and replace in the open scene; `Alt+Enter` scene details panel (the Windows "properties" gesture); `Cmd/Ctrl+Shift+Enter` focus mode; `Cmd/Ctrl+\` sidebar; `Alt+Up/Down` move the focused item in any ordered list; `Esc` closes the topmost panel or leaves focus mode; `?` (outside text fields) opens the shortcut sheet. Project search is the last row of the palette. No new shortcut may collide with a browser or system shortcut on macOS or Windows (Chrome, Safari, Firefox, Edge), nor with AltGr combinations, which Italian keyboards use to type `@`, `#`, `[` and `]`.

---

## 1. Information architecture

### 1.1 Global surfaces

| Surface | Route | Who and why | Notes |
|---|---|---|---|
| Landing | `/` | Visitor deciding whether to try it | Brand register. Signed-in users see a "Vai ai tuoi progetti" button instead of sign-up. |
| Sign in | `/login` | Returning author | Email and password. Link to sign-up and, when email is configured, to password reset. |
| Sign up | `/signup` | New author | Name, email, password (min 10 characters), language (prefilled from browser). Lands on `/projects`. |
| Password reset | `/reset-password` | Author locked out | P1, needs an email transport (section 9). |
| Projects | `/projects` | Choose, create, import, delete projects | After sign-in the app opens the last opened project's overview; `/projects` when there is none. |
| Account | `/account` | Profile, password, language, theme, timezone, editor defaults, guidance default, delete account | One page with anchored sections. |

### 1.2 The project workspace

Every project page lives under `/p/[projectId]`. Sections, their sub-pages and when they appear:

| Group | Section | Sub-pages | Visible when |
|---|---|---|---|
| (top) | Overview | Path, resume, today, recent | always |
| (top) | Goals | Targets, daily history, monthly averages, trend | always |
| Story | Architecture | Premise, Fabula, Setting | always |
| Story | Strands (game: Storylines and quests) | Strand sheet | always; quest fields need `quests` |
| Story | Notes | Note | always |
| World | Characters | Character sheet, profile section | always |
| World | Groups (game: Factions) | Group sheet | always |
| World | Locations | Location sheet | always |
| World | Objects (game EN: Items) | Object sheet | always |
| World | Relations | Map list, map, relationship list | always |
| World | Codex | Category, entry | `codex` on |
| Work | Manuscript (game: Script) | Outline, chapter, scene editor | always |
| Work | Flow | Graph, checks, list | `branching` on |
| Work | Variables | List | `variables` on |
| Work | Timeline | Chronological list, undated tray | always |
| Review | Analysis | Lengths, distributions | always |
| Review | Export | Manuscript, project document, team formats, backup | always |
| (footer) | Trash | | always |
| (footer) | Settings | General, type and modules, writing, structure, guidance, delete | always |
| (any) | Search | Results page | always, reached from the palette |

### 1.3 Desktop sidebar

`UDashboardSidebar`, collapsible to icons, resizable. From top to bottom:

1. Project switcher (project title, type label; menu: other projects, "Tutti i progetti", "Nuovo progetto").
2. Search field that opens the command palette, showing the `Cmd/Ctrl+K` hint.
3. Overview, Goals.
4. **Storia** / Story: Architecture, Strands, Notes.
5. **Mondo** / World: Characters, Groups, Locations, Objects, Relations, Codex.
6. **Scrittura** / Work: Manuscript, Flow, Variables, Timeline.
7. **Revisione** / Review: Analysis, Export.
8. Footer: Trash (count when not empty), Settings, account menu (account, theme, language, sign out).

Rules: a hidden module removes its entry, never greys it out. Flow shows a count badge when its checks find problems ("2", with the accessible label "2 problemi nel flusso"). Group headings are labels, not collapsible folders. The current section is marked by weight and an indicator, not by colour alone.

### 1.4 Phone navigation

A bottom bar with five entries, 44 px minimum targets, labels always visible:

| Position | Entry (IT / EN) | Goes to |
|---|---|---|
| 1 | Panoramica / Overview | `/p/[id]` |
| 2 | Manoscritto or Copione / Manuscript or Script | `/p/[id]/manuscript` |
| 3 | Aggiungi / Add (centre, icon `+`) | Capture drawer |
| 4 | Mondo / World | `/p/[id]/world`, a hub listing Characters, Groups, Locations, Objects, Relations, Codex with counts |
| 5 | Altro / More | Drawer: Goals, Architecture, Strands, Notes, Flow, Variables, Timeline, Analysis, Export, Trash, Settings, Projects, Account |

- **Capture drawer** (`UDrawer`): Nota veloce (first and largest; opens a new note with the keyboard up, so an idea takes two taps), Scena (appended to the last edited chapter), Personaggio, Luogo, Oggetto, Gruppo or Fazione, Evento, Voce del compendio (with `codex`).
- **Top bar** on every project page: back (when deeper than a section), page title, search icon (opens the full-screen palette), page menu.
- **Inside the scene editor** the bottom bar hides; a toolbar sits above the keyboard (formatting, dialogue punctuation, `@`, line with `script`, details). Scene details open as a bottom drawer.
- The `/p/[id]/world` route also exists on desktop as a hub page but is not in the sidebar.

### 1.5 Routes

```
/                                                landing
/login  /signup  /reset-password (P1)
/projects                                        projects list
/account                                         account
/p/[projectId]                                   overview
/p/[projectId]/goals
/p/[projectId]/architecture                      index of premise, fabula, setting
/p/[projectId]/architecture/[pillar]             pillar = premise | fabula | setting
/p/[projectId]/strands
/p/[projectId]/strands/[strandId]
/p/[projectId]/notes
/p/[projectId]/notes/[noteId]
/p/[projectId]/world                             hub (phone first)
/p/[projectId]/characters
/p/[projectId]/characters/[characterId]          sheet
/p/[projectId]/characters/[characterId]/[section]    section = a profile section key
/p/[projectId]/groups
/p/[projectId]/groups/[groupId]
/p/[projectId]/locations
/p/[projectId]/locations/[locationId]
/p/[projectId]/objects
/p/[projectId]/objects/[objectId]
/p/[projectId]/relations                         maps and the relationship list
/p/[projectId]/relations/[mapId]
/p/[projectId]/codex                             ?category=[categoryId]
/p/[projectId]/codex/[entryId]
/p/[projectId]/manuscript                        outline
/p/[projectId]/manuscript/chapters/[chapterId]
/p/[projectId]/manuscript/scenes/[sceneId]       editor; ?panel=details|revisions|find
/p/[projectId]/flow                              ?view=graph|list|checks
/p/[projectId]/variables
/p/[projectId]/timeline                          ?event=[eventId] opens the event slideover
/p/[projectId]/analysis                          ?tab=lengths|characters|locations|objects|strands|pov|game
/p/[projectId]/search                            ?q=
/p/[projectId]/export
/p/[projectId]/trash
/p/[projectId]/settings
```

The route language is English and fixed. Panels, tabs and slideovers that the user would expect the back button to close are reflected in the query string.

### 1.6 Layout rules

- Entity sections (characters, groups, locations, objects, strands, notes, codex) use list and detail. From `xl`, the list stays on the left while `/[id]` is open on the right (the Nuxt UI inbox pattern). Below `xl`, the list and the detail are separate pages.
- The scene editor is a single centred column; details, revisions and find open in a right-hand panel (desktop) or a bottom drawer (phone). The editor never shares the screen with the outline below `xl`.
- Dialogs are reserved for confirmations that destroy or replace something, and for project creation. Editing happens in place, in slideovers or on pages.
- Every list that has an order supports drag and drop plus `Alt+Up/Down` and a "Sposta" menu.

---

## 2. Terminology

### 2.1 Medium-aware vocabulary

These are the i18n keys every agent uses. "Game" columns apply when the project type is `game`; a novel with game modules keeps the novel vocabulary. Plurals are separate keys (`vocab.part.one`, `vocab.part.other`).

| Key | IT, romanzo | IT, videogioco | EN, novel | EN, game |
|---|---|---|---|---|
| `vocab.projectType` | Romanzo | Videogioco | Novel | Video game |
| `vocab.overview` | Panoramica | Panoramica | Overview | Overview |
| `vocab.goals` | Obiettivi | Obiettivi | Goals | Goals |
| `vocab.architecture` | Architettura | Architettura | Architecture | Architecture |
| `vocab.premise` | Premessa | Premessa | Premise | Premise |
| `vocab.fabula` | Fabula | Fabula | Fabula | Fabula |
| `vocab.setting` | Ambientazione | Ambientazione | Setting | Setting |
| `vocab.strands` | Linee narrative | Trame e missioni | Narrative strands | Storylines and quests |
| `vocab.strand` | Linea narrativa | Trama o missione | Narrative strand | Storyline or quest |
| `vocab.notes` | Note | Note | Notes | Notes |
| `vocab.world` | Mondo | Mondo | World | World |
| `vocab.characters` | Personaggi | Personaggi | Characters | Characters |
| `vocab.groups` | Gruppi | Fazioni | Groups | Factions |
| `vocab.group` | Gruppo | Fazione | Group | Faction |
| `vocab.locations` | Luoghi | Luoghi | Locations | Locations |
| `vocab.objects` | Oggetti | Oggetti | Objects | Items |
| `vocab.object` | Oggetto | Oggetto | Object | Item |
| `vocab.relations` | Relazioni | Relazioni | Relationships | Relationships |
| `vocab.relationMap` | Mappa delle relazioni | Mappa delle relazioni | Relationship map | Relationship map |
| `vocab.codex` | Compendio | Compendio | Codex | Codex |
| `vocab.codexEntry` | Voce | Voce | Entry | Entry |
| `vocab.manuscript` | Manoscritto | Copione | Manuscript | Script |
| `vocab.part` | Parte | Atto | Part | Act |
| `vocab.chapter` | Capitolo | Capitolo | Chapter | Chapter |
| `vocab.scene` | Scena | Scena | Scene | Scene |
| `vocab.synopsis` | Sinossi | Sinossi | Synopsis | Synopsis |
| `vocab.chapterPurpose` | Scopo del capitolo | Scopo del capitolo | Purpose of the chapter | Purpose of the chapter |
| `vocab.revision` | Revisione | Revisione | Revision | Revision |
| `vocab.history` | Cronologia | Cronologia | History | History |
| `vocab.timeline` | Linea del tempo | Linea del tempo | Timeline | Timeline |
| `vocab.event` | Evento | Evento | Event | Event |
| `vocab.analysis` | Analisi | Analisi | Analysis | Analysis |
| `vocab.export` | Esporta | Esporta | Export | Export |
| `vocab.trash` | Cestino | Cestino | Trash | Trash |
| `vocab.settings` | Impostazioni | Impostazioni | Settings | Settings |
| `vocab.audience` | lettore | giocatore | reader | player |
| `vocab.firstDraft` | Prima stesura | Prima stesura del copione | First draft | First draft of the script |
| `vocab.projectDocument` | Bibbia della storia | Documento di narrative design | Story bible | Narrative design document |
| `vocab.flow` | Flusso | Flusso | Flow | Flow |
| `vocab.variables` | Variabili di stato | Variabili di stato | State variables | State variables |

### 2.2 Fixed terms (same in both media)

| Concept | Italiano | English |
|---|---|---|
| Point of view / POV character | Punto di vista / Personaggio punto di vista | Point of view / POV character |
| Profile, interview, free text | Profilo, Intervista, Testo libero | Profile, Interview, Free text |
| Qualities, flaws, contradictions | Qualità, Difetti, Contraddizioni | Qualities, Flaws, Contradictions |
| Aliases | Altri nomi | Also known as |
| One-line description | In una riga | In one line |
| Mention | Menzione | Mention |
| Scene details | Dettagli della scena | Scene details |
| Story date, duration, date label | Data nella storia, Durata, Data come appare nella storia | Story date, Duration, Date as written in the story |
| Undated | Senza data | Undated |
| Story event / historical event | Evento della storia / Evento storico | Story event / Historical event |
| Choice, continuation | Scelta, Continuazione | Choice, Continue |
| Condition, effect | Condizione, Effetto | Condition, Effect |
| Start scene, ending | Scena iniziale, Finale | Start scene, Ending |
| Unreachable scene, dead end | Scena irraggiungibile, Vicolo cieco | Unreachable scene, Dead end |
| Dialogue line, speaker, direction | Battuta, Chi parla, Indicazione | Line, Speaker, Direction |
| Scene code, line ID | Codice scena, ID battuta | Scene code, Line ID |
| Quest giver, objectives, rewards | Committente, Obiettivi della missione, Ricompense | Quest giver, Objectives, Rewards |
| Playable | Giocabile | Playable |
| Focus mode | Modalità concentrazione | Focus mode |
| Words written, words removed | Parole scritte, Parole tolte | Words written, Words removed |
| Path (the A-to-Z guide) | Percorso | Path |
| Guidance | Guida | Guidance |
| Command palette | Cerca e comandi | Search and commands |
| Restore, delete forever, empty trash | Ripristina, Elimina definitivamente, Svuota il cestino | Restore, Delete forever, Empty trash |
| Backup | Backup del progetto | Project backup |

### 2.3 Enumeration labels

Every label is shown with an icon or text, never as colour alone.

| Enum | Key | Italiano | English |
|---|---|---|---|
| Project type | `novel` / `game` | Romanzo / Videogioco | Novel / Video game |
| Scene status | `planned` | Pianificata | Planned |
| | `draft` | Bozza | Draft |
| | `revised` | Rivista | Revised |
| | `final` | Definitiva | Final |
| Planning status | `todo` | Da fare | To do |
| | `progress` | In corso | In progress |
| | `done` | Fatto | Done |
| Importance | `main` | Principale | Main |
| | `secondary` | Secondario | Secondary |
| | `minor` | Comparsa | Minor |
| Point of view | `first` | Prima persona | First person |
| | `second` | Seconda persona | Second person |
| | `third_limited` | Terza persona limitata | Third person limited |
| | `third_omniscient` | Terza persona onnisciente | Third person omniscient |
| | `third_objective` | Terza persona oggettiva | Third person objective |
| | `multiple` | Punti di vista multipli | Multiple points of view |
| Strand kind | `plot` | Trama principale | Main plot |
| | `subplot` | Sottotrama | Subplot |
| | `arc` | Arco di un personaggio | Character arc |
| | `quest` | Missione principale | Main quest |
| | `side_quest` | Missione secondaria | Side quest |
| Relation kind | `family` | Famiglia | Family |
| | `romance` | Amore | Romance |
| | `friendship` | Amicizia | Friendship |
| | `alliance` | Alleanza | Alliance |
| | `rivalry` | Rivalità | Rivalry |
| | `enmity` | Inimicizia | Enmity |
| | `mentorship` | Guida | Mentorship |
| | `professional` | Lavoro | Professional |
| | `ownership` | Possesso | Ownership |
| | `place` | Luogo | Place |
| | `membership` | Appartenenza | Membership |
| | `other` | Altro | Other |
| Group kind | `family` | Famiglia | Family |
| | `faction` | Fazione | Faction |
| | `organization` | Organizzazione | Organization |
| | `culture` | Popolo e cultura | People and culture |
| | `other` | Altro | Other |
| Scene kind | `scene` | Scena | Scene |
| | `cutscene` | Cinematica | Cutscene |
| | `dialogue` | Dialogo | Dialogue |
| | `gameplay` | Fase di gioco | Gameplay |
| | `exploration` | Esplorazione | Exploration |
| | `combat` | Combattimento | Combat |
| | `puzzle` | Enigma | Puzzle |
| Profile section | `personal` | Dati personali | Personal data |
| | `physical` | Aspetto fisico | Physical features |
| | `behavior` | Comportamenti e atteggiamenti | Behaviours and attitudes |
| | `psychology` | Psicologia | Psychology |
| | `ideas` | Idee e passioni | Ideas and passions |
| | `sociology` | Sociologia | Sociology |
| | `backstory` | Vita prima della storia | Life before the story |
| | `conflict` | Conflitto | Conflict |
| | `evolution` | Evoluzione nella storia | Evolution during the story |
| | `gameplay` (game only) | Ruolo nel gioco | Role in the game |
| | `voice` (game only) | Voce e recitazione | Voice and performance |
| Module | `branching` | Bivi e flusso | Branching and flow |
| | `variables` | Variabili di stato | State variables |
| | `quests` | Missioni | Quests |
| | `codex` | Compendio | Codex |
| | `script` | Battute di dialogo | Dialogue lines |
| | `scene_kinds` | Tipi di scena | Scene kinds |
| Dialogue punctuation | `guillemets` | Caporali « » | Guillemets « » |
| | `double_quotes` | Virgolette alte “ ” | Double quotes “ ” |
| | `dash` | Lineetta — | Dash — |

`gameplay` and `voice` appear in game projects only (type `game`), whatever the modules say. Default dialogue punctuation follows the manuscript language: Italian `guillemets`, English `double_quotes`.

---

## 3. The path from idea to finished work

The path (`Percorso`) is a checklist computed from the project's data, shown on the overview. It is a suggestion, never a gate: every section is open from the first minute, stages can be completed in any order, and nothing is locked.

### 3.1 Rules common to both media

- **Computed, live.** One server endpoint returns the stages with `done`, a progress fraction and a short reason ("2 scene ancora pianificate"). A stage can go back to incomplete when the data changes (a new planned scene reopens the draft stage); that is honest and useful, not a regression to hide.
- **Current stage** = the first incomplete stage in order. The overview shows it expanded with its question and primary action; the others are one line each.
- **Definitions used below.** A text field "has N words" by the shared counter. A profile section is *answered* when its content in its current mode (interview answers summed, or free text) has at least 10 words. Trashed items never count. "Every scene" means at least one scene exists.
- **Completion message.** When a stage turns done, the next visit to the overview shows one line: "Premessa: fatto. Il prossimo passo è il protagonista." No confetti, no exclamation marks.

### 3.2 Novel

| # | Key | Stage (IT / EN) | Question shown | Done when | Links to |
|---|---|---|---|---|---|
| 1 | `premise` | Premessa / Premise | Chi vuole cosa, e cosa glielo impedisce? | premise has at least 30 words | `/architecture/premise` |
| 2 | `protagonist` | Protagonista / Protagonist | Chi porta la storia sulle spalle? | at least one `main` character has 3 answered profile sections, one of them `conflict` | `/characters` (new main character, or the first main character's `conflict` section) |
| 3 | `world` | Il mondo / The world | Dove e quando succede? | setting has at least 30 words and at least 1 location exists | `/architecture/setting`, then `/locations` |
| 4 | `plot` | La trama / The plot | Cosa succede, dall'inizio alla fine? | fabula has at least 100 words and at least 1 strand of kind `plot` exists | `/architecture/fabula`, `/strands` |
| 5 | `structure` | La struttura / The structure | In quali capitoli e scene si divide? | at least 3 chapters and 6 scenes, every chapter has at least 1 scene | `/manuscript` |
| 6 | `draft` | Prima stesura / First draft | Scrivi, una scena alla volta. | every scene has at least 1 word and status other than `planned` | the first scene, in manuscript order, that fails the rule |
| 7 | `revision` | Revisione / Revision | La storia tiene? | every scene is `revised` or `final`; every chapter's purpose has at least 5 words; every `main` character and every `plot` or `subplot` strand is tagged in at least 1 scene | `/analysis`, then the first failing item |
| 8 | `delivery` | Consegna / Delivery | Pronto per un editor. | every scene is `final` and at least one DOCX, EPUB or PDF manuscript export was made while every scene was `final` | `/export` |

### 3.3 Video game

Where a rule depends on a module that is off, the bracketed part is skipped.

| # | Key | Stage (IT / EN) | Question shown | Done when | Links to |
|---|---|---|---|---|---|
| 1 | `premise` | Premessa / Premise | Chi è il giocatore, cosa vuole, cosa lo ferma? | premise has at least 30 words | `/architecture/premise` |
| 2 | `protagonist` | Protagonista / Protagonist | Chi guida il giocatore nella storia? | at least one `main` character has 3 answered profile sections, one of them `conflict` (the `gameplay` and `voice` sections count) | `/characters` |
| 3 | `world` | Mondo e lore / World and lore | Cosa deve sapere il team del mondo? | setting has at least 30 words and locations + groups + objects + codex entries together number at least 3 | `/architecture/setting`, `/world` |
| 4 | `quests` | Trama e missioni / Plot and quests | Qual è la missione principale? | fabula has at least 100 words and [`quests` on: at least 1 strand of kind `quest` with at least 1 objective] [`quests` off: at least 1 strand of kind `plot`] | `/architecture/fabula`, `/strands` |
| 5 | `structure` | Struttura e flusso / Structure and flow | Da dove si parte e dove si può finire? | at least 6 scenes, every chapter has at least 1 scene [`branching` on: a start scene is set and at least 1 scene is an ending] | `/manuscript`, `/flow` |
| 6 | `draft` | Prima stesura del copione / First draft of the script | Scrivi ogni scena e ogni bivio. | every scene has at least 1 word and status other than `planned` [`branching` on: no unreachable scenes and no dead ends] | the first failing scene, or `/flow?view=checks` |
| 7 | `revision` | Revisione / Revision | Ogni percorso porta da qualche parte? | every scene is `revised` or `final`; [`quests` on: every `quest` and `side_quest` strand is tagged in at least 1 scene] [`variables` on: every variable is used by at least 1 condition or effect] [`branching` on: every ending is reachable] [`script` on: every dialogue line has a speaker] | `/flow?view=checks`, `/variables`, then the first failing item |
| 8 | `delivery` | Consegna al team / Handoff to the team | Il team può costruire da qui. | every scene is `final` and at least one team export (JSON, Twee, Ink, voice-over CSV or design document) was made while every scene was `final` and the flow checks were clean | `/export` |

### 3.4 How an expert hides the path

- **Per project:** setting "Mostra il percorso e la guida" (Settings, Guidance). The path card on the overview also has "Nascondi il percorso" in its menu: one click, no confirmation, and it is gone; the palette offers "Mostra il percorso" to bring it back.
- **Per account:** "Guida nei nuovi progetti", on for new accounts. It decides the default of every new blank or template project. Imported projects start with guidance off; demo projects start with it on.
- **What guidance controls:** the path card, the "Cos'è la fabula?" style explanations (collapsed disclosures under page titles), the hint lines under interview questions, and the explanatory paragraph of empty states. The one-sentence empty-state copy always stays, because an empty list must say what it is for.
- **What guidance never does:** block a section, open a tour, show a modal, or change data. The stage computation keeps running when guidance is off (it costs nothing), so turning it back on shows the true state at once.

---

## 4. Screen inventory

Each screen: the primary task, key content, key actions, the empty state (what it teaches and its one sentence of Italian copy; the English copy is a faithful translation), and the phone adaptation. Empty-state copy for game projects is given where it differs.

### 4.1 Global

**Landing** (`/`)
- Task: understand in ten seconds what Dramatis is and start.
- Content: one sentence of promise ("Dal primo spunto al manoscritto finito, con tutto il mondo della storia in ordine."), the method in three steps (bible, manuscript, export), novels and games, phone and desk, trust (autosave, revisions, trash, backup, export), a plain statement "Nessuna intelligenza artificiale scrive al posto tuo." Screenshots of the editor and the character interview.
- Actions: "Crea un account", "Accedi", language switch.
- Phone: single column; the two actions stay visible at the top.

**Sign in, sign up** (`/login`, `/signup`)
- Task: get in with email and password.
- Content: the form, one line of brand copy, link to the other form.
- Actions: submit; show/hide password; errors inline ("Email o password non corretti", never which of the two).
- Phone: full-width form, the keyboard type matches the field.

**Projects** (`/projects`)
- Task: open the project you work on, or start a new one.
- Content: a list (not a card grid): title, type label, total words, last edited ("ieri, 22:14"), current path stage or "Percorso nascosto". Deleted projects behind a "Eliminati" filter.
- Actions: Nuovo progetto, Importa (Dramatis backup P0; bibisco, DOCX, Markdown P1), Apri un progetto di esempio; per row: rinomina, duplica (P1), scarica backup, elimina, ripristina (deleted filter).
- Empty: teaches the three ways to start. "Ogni storia comincia da un'idea: crea il tuo primo progetto, o apri un esempio per vedere come funziona."
- Phone: the list full width; "Nuovo progetto" as a fixed primary button at the bottom.

**New project** (dialog on desktop, full-height drawer on phone)
- Task: create a project in one step.
- Content: title (optional, defaults to "Senza titolo"), type (Romanzo / Videogioco, each with one line of explanation), start from (Vuoto / Da una struttura with the template list / Progetto di esempio).
- Actions: Crea, Annulla. No second step.

**Account** (`/account`)
- Task: change who you are and how the app behaves for you.
- Content: profile (name, email), password, language, theme (light, dark, system), timezone, editor defaults (serif or sans, size, line height, line width), "Guida nei nuovi progetti", backup of all projects (P1), delete account.
- Actions: save per section; delete account requires typing the email and offers the backup first.
- Phone: one column, sections as anchors at the top.

### 4.2 Project home

**Overview** (`/p/[id]`)
- Task: pick up where you left off and see where the story stands.
- Content: the primary action "Riprendi: «titolo della scena»" (last edited scene); the path card (when guidance is on); today in a sentence ("Oggi 1.240 parole su 1.000. In tutto 38.420 su 80.000."); the deadline line when set ("Mancano 42 giorni. Al ritmo attuale finisci il 3 febbraio."); the last five edited items; for games with `branching`, one line of flow health ("Flusso: 2 scene irraggiungibili") linking to the checks.
- Actions: resume, the current stage's action, hide the path, open goals.
- Empty: the path is the empty state. "Il progetto è vuoto: comincia dalla premessa, bastano poche righe."
- Phone: the resume button full width at the top, then today, then the path.

**Goals** (`/p/[id]/goals`)
- Task: set a pace and see whether you keep it.
- Content: targets (total words, daily words, deadline, each optional); progress against each (bar with numbers); daily history of the last 30 days (words written per day, words removed as a separate number); monthly averages (month, writing days, words written, average per writing day); trend (average of the last 14 writing days, projected finish date, daily words needed to meet the deadline).
- Actions: edit targets, switch the history between bars and table, choose 30 or 90 days.
- Empty: "Un obiettivo dà un ritmo: scegli quante parole scrivere in tutto, ogni giorno, o entro una data." History with no data: "Qui vedrai le parole scritte ogni giorno, dalla prima sessione in poi."
- Phone: stacked; the history defaults to the table.

### 4.3 Story

**Architecture index** (`/p/[id]/architecture`)
- Task: see the three pillars of the story at a glance.
- Content: premise, fabula, setting as three rows with planning status, word count and the first two lines; links to strands and notes.
- Actions: open each, change status inline.
- Empty: each empty row shows its own one-line definition (below).
- Phone: the same three rows.

**Premise, fabula, setting** (`/p/[id]/architecture/[pillar]`)
- Task: write the pillar.
- Content: title, planning status, word count, a rich text editor with the manuscript typography; with guidance on, a collapsed "Cos'è la premessa?" explanation.
- Actions: write, mention (`@`), change status.
- Empty: premise "La premessa è la storia in poche righe: chi vuole cosa, cosa glielo impedisce, cosa rischia."; fabula "La fabula è la storia in ordine cronologico, dall'inizio alla fine, come si è svolta davvero."; setting "L'ambientazione dice dove e quando succede la storia, e con quali regole."
- Phone: full-screen editor with the keyboard toolbar.

**Strands** (`/p/[id]/strands`)
- Task: keep track of the threads that cross the story.
- Content: rows with colour swatch and colour name, title, kind label, planning status, number of scenes tagged; filter by kind.
- Actions: new strand, reorder, open, trash.
- Empty: "Una linea narrativa è un filo che attraversa la storia: la trama principale, una sottotrama, l'arco di un personaggio." Game: "Una trama o una missione è un filo che attraversa il gioco: la missione principale, le secondarie, l'arco di un personaggio."
- Phone: single list; filter as a horizontal chip row.

**Strand sheet** (`/p/[id]/strands/[strandId]`)
- Task: define a thread and see where it runs.
- Content: title, kind, colour, status, description; the scenes where it is tagged, in manuscript order with chapter; kind `arc`: the character whose arc it is; kinds `quest` and `side_quest` (module `quests`): giver (character), objectives (ordered; text, optional flag, the scene where it is completed; the check is computed: done when that scene is at least `draft`), rewards (text, optional link to an object).
- Actions: edit fields, add, reorder and remove objectives and rewards, jump to a scene.
- Empty (no scenes tagged): "Nessuna scena appartiene ancora a questa linea: aggiungila dai dettagli di una scena."
- Phone: stacked sections.

**Notes** (`/p/[id]/notes`, `/p/[id]/notes/[noteId]`)
- Task: a notebook for ideas and research.
- Content: list with title, first line, last edited; the note is a title plus rich text with mentions.
- Actions: new note, reorder, trash.
- Empty: "Le note sono il tuo quaderno: idee, ricerche, cose da ricordare."
- Phone: the note opens full screen with the keyboard up; "Nota veloce" from the capture drawer creates one with today's date as title.

### 4.4 World

**World hub** (`/p/[id]/world`)
- Task: reach any part of the bible from the phone.
- Content: Characters, Groups, Locations, Objects, Relations, Codex as rows with counts and the last edited item.
- Empty: "Il mondo della storia: personaggi, gruppi, luoghi e oggetti, tutti collegati tra loro."
- Phone: this is the "Mondo" tab.

**Characters** (`/p/[id]/characters`)
- Task: find a character, or add one.
- Content: grouped by importance (Principali, Secondari, Comparse); each row: avatar (primary image or initials), name, one-line description, planning status, number of scenes; text filter matching names and aliases; sort by manual order, name or appearances.
- Actions: new character (inline: name and importance, Enter creates and opens the sheet; importance defaults to `main` while the project has no main character, to `secondary` afterwards), reorder within a group, trash.
- Empty: "I personaggi sono il cuore della storia: comincia dal protagonista, le domande giuste arrivano dopo."
- Phone: the list; new character as the primary button.

**Character sheet** (`/p/[id]/characters/[characterId]`)
- Task: know everything about this person in one place.
- Content: header (primary image, name, aliases, importance, status, one-line description; game: "Giocabile"); for `main`, the profile sections with their progress ("5 di 8 risposte"); for `secondary` and `minor`, a description field (game projects: also the `voice` section); qualities, flaws and contradictions (three short lists, every importance level); relationships (read from the global relationships: "Tobia · padre"); groups (membership relationships, with role); appearances (scenes where tagged, in manuscript order, "compare per la prima volta nel capitolo 2"); images (gallery with captions); notes; P1, game with `script`: lines spoken, with word count.
- Actions: edit inline, change importance (sections hide on demotion and come back on promotion), add images, add relationship, show in a map, trash.
- Empty pieces teach in place: no relationships "Nessuna relazione: collega questo personaggio a qualcuno."; no appearances "Non compare ancora in nessuna scena: citalo con @ mentre scrivi."
- Phone: header, then a vertical list of sections; each section opens as its own page.

**Profile section** (`/p/[id]/characters/[characterId]/[section]`)
- Task: answer the interview, or write freely.
- Content: section title, mode switch (Intervista / Testo libero), the questions (appendix A) each with a multi-line plain-text answer, or one rich text field; with guidance on, a hint line under some questions (P1); previous and next section.
- Actions: answer (autosave per answer), switch mode (both contents are kept; a note appears when the other mode also has content: "Ci sono anche risposte nell'intervista."), go to the next section.
- Empty (free text): "Scrivi liberamente, oppure torna all'intervista."
- Phone: questions stacked, answers expand as you type, previous/next fixed at the bottom.

**Groups** (`/p/[id]/groups`, game label Fazioni)
- Task: keep families, guilds, factions and peoples together.
- Content: rows with colour and colour name, name, kind label, number of members, status.
- Actions: new group, reorder, open, trash.
- Empty: "Un gruppo riunisce personaggi, luoghi e oggetti: una famiglia, una gilda, un popolo." Game: "Una fazione riunisce personaggi, luoghi e oggetti: una gilda, un clan, un esercito."
- Phone: single list.

**Group sheet** (`/p/[id]/groups/[groupId]`)
- Task: describe the group and see who and what belongs to it.
- Content: name, kind, status, colour, description, language, traditions, powers (four rich text fields); members (characters with their role, locations, objects), read from `membership` relationships; relationships with other groups; images.
- Actions: add member (picker across characters, locations, objects; the role is the relationship label), remove member (the relationship goes to the trash), edit fields.
- Empty (no members): "Nessun membro: aggiungi personaggi, luoghi o oggetti che appartengono a questo gruppo."
- Phone: stacked sections.

**Locations** (`/p/[id]/locations`, `/p/[id]/locations/[locationId]`)
- Task: build the places and find them fast.
- Content: list with name, the place line (city, region, nation), status, number of scenes. Sheet: name, nation, region, city, status, description, images, significant events (events linked to it), scenes set here, characters linked by `place` relationships, groups.
- Actions: new location, edit, add event (creates an event already linked), trash.
- Empty: "I luoghi danno corpo alla storia: dalla nazione alla stanza in cui succede la scena."
- Phone: list, then stacked sheet.

**Objects** (`/p/[id]/objects`, `/p/[id]/objects/[objectId]`, game EN label Items)
- Task: track the things that matter to the plot.
- Content: list with name, status, number of scenes. Sheet: name, status, description, images, events, owners (`ownership` relationships), scenes where it appears, groups.
- Actions: new object, edit, add event, trash.
- Empty: "Gli oggetti che contano: una lettera, un'arma, una chiave che apre più di una porta."
- Phone: list, then stacked sheet.

**Relations** (`/p/[id]/relations`)
- Task: see and edit who is tied to whom.
- Content: two tabs. Mappe: the maps with name and number of nodes. Elenco: everyone with a relationship (characters first, main ones first, then groups, places, objects), each with the portrait on the left and a row per relationship on the right (the other, what the other is to them, the kind); a row opens the bond under the portrait: its name, its intensity as this side feels it (Debole, Media, Forte) and "Evoluzione del legame", the chapters where the bond changes for this side with the intensity from there on and a note. Filterable by kind and entity; this list is the full keyboard and screen-reader alternative to the maps.
- Actions: new map, new relationship (form: from, kind filtered to valid pairs, label, reverse label, mutual or directed, description), edit, trash.
- Empty: "Una mappa mostra chi è legato a chi: crea una mappa, aggiungi due personaggi e collegali."
- Phone: tabs as a segmented control; the list is the default tab.

**Relation map** (`/p/[id]/relations/[mapId]`)
- Task: draw and read the web of relationships.
- Content: Vue Flow canvas. Nodes show image or type icon, name and type label. Edges show the kind colour and always a text label (the relationship label, or the kind label when empty); parallel relationships between the same pair are stacked labels on one edge. A legend lists the kinds in use.
- Actions: add nodes (multi-select picker, with "Aggiungi anche i collegati"); drag from a node's handle to another node to create a relationship; select a node for "Collega a...", "Apri scheda", "Togli dalla mappa"; select an edge to edit or trash the relationship; fit to view; zoom. Node positions are saved per map.
- Empty: "Aggiungi personaggi, luoghi, oggetti o gruppi, poi trascina da uno all'altro per collegarli."
- Phone: pan and pinch; tapping a node or edge opens a bottom drawer with the same actions; linking is done with "Collega a...".

**Codex** (`/p/[id]/codex`, `/p/[id]/codex/[entryId]`, module `codex`)
- Task: keep the lore the team (or the author) must know.
- Content: categories (user-defined, ordered, with counts; when the module is switched on, seven are created: Storia, Popoli, Religioni, Magia e tecnologia, Bestiario, Lingue, Politica), entries (title, category, last edited). The entry is a title, a category and rich text with mentions; P1: "Citata in" backlinks.
- Actions: new entry, new category, rename, reorder, move an entry to another category, trash.
- Empty: "Il compendio raccoglie il sapere del mondo: storia, popoli, religioni, magia, tutto ciò che il lettore non legge ma tu devi sapere." Game: "... tutto ciò che il team deve sapere."
- Phone: categories as a select at the top, then the entries.

### 4.5 Work

**Manuscript outline** (`/p/[id]/manuscript`, game label Copione)
- Task: shape the structure and move through it.
- Content: a tree of parts (when used), chapters and scenes. Scene rows: status icon and label, title, word count, optional one-line synopsis ("Mostra sinossi"); game rows add kind icon, scene code, "Inizio" and "Finale" marks, number of choices. Chapter rows: title, word count, number of scenes, a mark when the purpose is empty. Header: total words and the status line ("12 bozze, 4 riviste, 2 definitive").
- Actions: new part, chapter or scene at a position; drag and drop to reorder scenes and chapters and to move scenes between chapters and chapters between parts; `Alt+Up/Down`; "Sposta in..." (chapter picker); inline rename and status; open; trash. P1: multi-select scenes to set status or move together; filter by status, character, location, strand.
- Empty: "Il manoscritto è fatto di capitoli e scene: crea il primo capitolo e comincia a scrivere." Game: "Il copione è fatto di atti, capitoli e scene: crea la prima scena, il gioco comincia lì."
- Phone: nested list with collapsible chapters; reorder by long press on the handle or "Sposta"; tapping a scene opens the editor.

**Chapter** (`/p/[id]/manuscript/chapters/[chapterId]`)
- Task: say why the chapter exists and see what is in it.
- Content: title, part, purpose, notes, the scenes (reorderable), word count, status line, the characters and locations present (computed from its scenes). A reading view (`?view=read`) shows the active text of every scene in order, read only, with scene breaks; tapping a scene opens it in the editor.
- Actions: edit, new scene, reorder scenes, read, trash (scenes go with it).
- Empty: "Questo capitolo non ha ancora scene: aggiungine una, anche solo con la sinossi."
- Phone: the reading view is the way to read back the last chapter on the train.

**Scene editor** (`/p/[id]/manuscript/scenes/[sceneId]`)
- Task: write.
- Content: top bar with breadcrumb, editable title, status, save state ("Salvato", "Salvataggio...", "Non salvato, riprovo", "Conflitto: salvato come nuova revisione"), scene words and session words; buttons for details, revisions, find, focus and a menu (move, trash; P1 duplicate). A slim writing bar under it, hidden in focus mode: dialogue punctuation (the project's quotes, dash, ellipsis), with `script` a "Battuta" button. The text in a centred column with the account's typography. Formatting through a bubble menu on selection (bold, italic, underline, strikethrough, quote, alignment), `/` for blocks (separator, quote, list, line), `@` for mentions.
- Details panel (`?panel=details`): status, synopsis, point of view, POV character, characters, locations, objects (each tag shows its source: `@` when it comes from the text, a speaker icon from dialogue, none when manual), strands, story date and time, date label, duration, notes. With `scene_kinds`: kind. With `branching` or `script`: code (read only, copyable). With `branching`: start scene, ending and its label, outgoing choices (add, edit, reorder), incoming choices and the implicit continuation.
- Revisions panel (`?panel=revisions`): revisions with the active one marked, the history of each; section 5.7.
- Empty: placeholder "Comincia a scrivere. Digita @ per citare un personaggio." With `script`: "Comincia a scrivere. Digita @ per citare un personaggio, / per inserire una battuta."
- Phone: full screen; a minimal top bar (back, title, save state as icon and word, details); a toolbar above the keyboard (bold, italic, quotes, dash, ellipsis, `@`, line, undo, redo); details and revisions as drawers.

**Flow** (`/p/[id]/flow`, module `branching`)
- Task: see every path through the game and fix the broken ones.
- Content: three views. Grafo: one node per scene (title, kind, status, code, "Inizio" and "Finale" marks), laid out by default in one column per chapter under act headings, positions saved when dragged; solid edges for choices, labelled with the choice text and a lock icon when conditioned; dashed edges for implicit continuation. Elenco: each scene with its outgoing choices, targets, conditions and effects as sentences ("Se fiducia_oren è almeno 3: fiducia_oren aumenta di 1"). Controlli: errors and warnings (section 5.5).
- Actions: drag from a node's handle to another node to add a choice; select a node to open the scene, add a choice, set start or ending; select an edge to edit the choice; "Riordina" resets the layout; from a check, "Mostra" centres the node and "Apri scena" opens it.
- Empty: "Il flusso mostra come le scene si collegano: crea una scena e indicala come iniziale." Clean checks: "Nessun problema: ogni scena è raggiungibile e ogni percorso arriva a un finale."
- Phone: opens on Elenco; the graph pans and pinches, tapping a node opens a drawer.

**Variables** (`/p/[id]/variables`, module `variables`)
- Task: define the state the game remembers.
- Content: table with name (monospace), type, default, description, where it is used (count of conditions and effects; click for the list of choices).
- Actions: new variable (inline row), edit, reorder, trash (when used: "Usata in 3 scelte: le scelte restano, i controlli le segnaleranno.").
- Empty: "Le variabili ricordano cosa ha fatto il giocatore: una chiave trovata, la fiducia di un alleato, una porta aperta."
- Phone: a list showing name, type and default; editing in a drawer.

**Timeline** (`/p/[id]/timeline`)
- Task: put scenes and events in story order and catch contradictions.
- Content: vertical chronological list of dated scenes and events, grouped by year, month and day as density requires; each item shows the date (or its label), title, type (scene with its chapter, story event, historical event), duration and linked characters and locations. An "Senza data" tray counts undated scenes. P1: overlap warnings; "Ordine del racconto" toggle showing manuscript position beside story position, flashbacks marked.
- Actions: filter by characters, locations, objects, strands, type; new event (slideover `?event=`); edit; give a scene a date; jump to a scene.
- Empty: "La linea del tempo mette in ordine scene ed eventi: dai una data a una scena e la vedrai qui."
- Phone: single column; filters in a drawer.

### 4.6 Review and utilities

**Analysis** (`/p/[id]/analysis`)
- Task: see how the story is distributed across the chapters.
- Content: tabs Lunghezze (words and scenes per chapter, average, longest and shortest), Personaggi, Luoghi, Oggetti, Linee narrative (matrices of entity by chapter, each cell the number of scenes, row totals; minor characters behind a toggle), Punti di vista (POV value by chapter, POV character by chapter), Stato (scene status by chapter). P1 game tab: scene kinds per act, choices per scene, endings, lines and words per speaker. Cells carry numbers; zero cells stay blank; clicking a cell lists its scenes.
- Empty: "L'analisi mostra come personaggi, luoghi e linee narrative si distribuiscono nei capitoli: servono almeno un capitolo e una scena."
- Phone: matrices scroll horizontally with the first column fixed; tabs as a select.

**Search** (`/p/[id]/search?q=`)
- Task: find a word or a name anywhere in the project.
- Content: results grouped by type with counts; scene results with snippet, highlight, chapter and status; filters by type, chapter, status. P1: replace (section 5.9).
- Empty: "Nessun risultato per «{q}»: prova con un altro nome o un'altra parola."
- Phone: full screen; filters in a drawer.

**Command palette** (overlay, `Cmd/Ctrl+K`)
- Task: go anywhere or do anything without the mouse.
- Content: with no query, recent items and common actions; with a query, grouped results (sections, scenes, characters by name and alias, locations, objects, groups, strands, codex entries, notes, variables, actions) and "Cerca «x» nel testo".
- Phone: full screen from the search icon.

**Export** (`/p/[id]/export`)
- Task: get the work out in the shape someone needs.
- Content: what to export (Manoscritto or Copione: DOCX, PDF, EPUB, TXT; Documento di progetto: DOCX, PDF P1; with game modules, Formati per il team: JSON, Twee 3, Ink, voice-over CSV; Backup del progetto), the options of the chosen kind (appendix D), the last exports.
- Actions: Esporta (download).
- Empty: "Non c'è ancora niente da esportare: scrivi una scena e torna qui." The backup is always available.
- Phone: stacked option groups; the file goes to the browser's download or share sheet.

**Trash** (`/p/[id]/trash`)
- Task: get something back, or let it go for good.
- Content: items grouped by type, with name, when deleted and what went with it ("con 4 scene").
- Actions: Ripristina; Elimina definitivamente (confirmation); Svuota il cestino (confirmation with the count).
- Empty: "Il cestino è vuoto. Quello che elimini resta qui finché non decidi tu."
- Phone: list; actions in the row menu.

**Project settings** (`/p/[id]/settings`)
- Task: change what the project is and how it behaves.
- Content: General (title, subtitle, author name for exports, manuscript language); Type and modules (type with what changes; six module switches with one line each and their dependency); Writing (dialogue punctuation, smart typography for quotes, dashes and ellipsis); Structure (use parts, or acts); Guidance; Delete project (it moves to the deleted projects, restorable).
- Phone: one column.

---

## 5. Key flows

### 5.1 Creating the first project

1. After sign-up the author lands on `/projects`, which is empty and offers "Nuovo progetto", "Apri un progetto di esempio" and "Importa".
2. "Nuovo progetto" opens the creation dialog with the title field focused. Type defaults to Romanzo. "Parti da" defaults to Vuoto; choosing "Da una struttura" shows the templates for the chosen type (appendix B), each with one line and its shape ("3 atti, 8 capitoli, 8 scene"); changing type swaps the list.
3. "Crea" creates everything in one transaction: the project (type, the type's default modules, manuscript language = UI language, dialogue punctuation for that language, guidance from the account default, parts off for novels and on for games unless the template says otherwise) and, for a template, its parts, chapters, planned scenes with synopses, strands and, for games, start scene, endings, choices and variables. Template and demo text never counts as words written.
4. The app opens the overview. Blank or template: the path shows stage 1 expanded with "Scrivi la premessa"; a template adds one line: "Struttura «Tre atti» creata: 8 capitoli con una scena pianificata ciascuno." Demo: a quiet banner "Questo è un progetto di esempio: modificalo come vuoi, eliminalo quando non serve più." with "Elimina l'esempio".
5. Writing can start before any structure exists: creating a scene in a project with no chapter creates "Capitolo 1" (and "Parte prima" or "Atto I" when parts are on). In a game with `branching`, the first scene ever created becomes the start scene, marked "Inizio".

Edge cases: the button is disabled while the request runs (no double projects); on failure the dialog stays open with the error and nothing is created; an empty title becomes "Senza titolo"; titles need not be unique.

**Changing type later.** Settings, Tipo: choosing the other type opens a confirmation that lists what changes (the vocabulary, the default modules shown as pre-ticked switches the author can untick) and states that nothing is deleted. Parts, chapters and scenes stay exactly where they are; only their names change. Going back to novel leaves the modules as the author sets them in the same confirmation.

### 5.2 Creating a main character through the interview

1. Characters, "Nuovo personaggio": an inline row with the name focused and importance preselected (Principale when no main character exists yet). Enter creates the character with status `todo` and opens the sheet.
2. The sheet lists the profile sections (nine; eleven in game projects), each with its progress ("0 di 8 risposte"). With guidance on, a primary "Comincia l'intervista" opens `personal`; without guidance, the sections are simply listed.
3. The section opens in interview mode. On desktop the first answer is focused; on phone nothing is focused, so the keyboard does not cover the questions.
4. Each answer autosaves one second after the last keystroke; the page header shows the save state.
5. "Sezione successiva" at the bottom moves on; the sheet's progress updates.
6. The mode switch moves a section to "Testo libero". The interview answers stay stored and come back when the author switches again; a note says when the other mode has content. P1: "Usa le risposte come traccia" copies the questions and answers into the free text as a starting point.
7. Qualities, flaws and contradictions are three short lists on the sheet: type, Enter adds, drag or `Alt+Up/Down` reorders, delete removes with an undo toast. Field-level deletions use undo, not the trash; the trash holds entities.
8. Images: drop or choose files; the first becomes the primary image; captions are edited inline.
9. When three sections are answered, one of them `conflict`, the path's second stage turns done.

Edge cases: a duplicate name is allowed and flagged inline ("Esiste già un personaggio di nome Marta"); demoting a main character hides the sections and shows "Le risposte del profilo sono conservate: tornano se lo rendi di nuovo principale."; promoting a secondary character keeps the description visible above the sections.

### 5.3 Tagging while writing

1. In a scene the author types `@`. A menu opens at the caret: characters first (main, secondary, minor), then locations, objects, groups and codex entries, each with its type icon and label. Matching uses names and aliases and ignores accents and case ("@nic" finds "Nicolò").
2. Up, Down and Enter (or a tap) insert a mention that displays the text that matched (the name or the alias). `Esc` closes the menu and leaves the `@` as typed.
3. The last items are "Crea «Ivan» come personaggio", "...come luogo", "...come oggetto". Creating a character makes a `minor` one; the mention is inserted and a toast says "Ivan creato come comparsa" with "Apri scheda".
4. On save, the server reads the revision: every character, location or object mentioned becomes a tag with source `mention`; mention tags whose entity is no longer in the text are removed; every speaker of a dialogue line becomes a tag with source `dialogue`; manual tags are never touched. Mentions of groups and codex entries do not create tags (scenes have no such fields); P1 shows them as "Citata in" on the entity.
5. The details panel (`Alt+Enter`) shows the tags with their source. A mention or dialogue tag cannot be removed from the panel; its menu says "Citato 3 volte nel testo" and offers "Trova nel testo". Manual tags are added with a searchable multi-select that can also create.
6. Setting the POV character offers the scene's characters first and adds the chosen one as a manual tag when not already tagged.
7. Hovering a mention (desktop) or tapping it (phone) opens a card: primary image, name, importance, one-line description, the first four answered questions of `physical` (or the start of its free text), "Apri scheda". On desktop the sheet opens in a slideover and the scene stays where it was; on phone it opens as a page and back returns to the same scroll position. This is how the author checks an eye colour without leaving the scene.

Edge cases: a mention stores the entity id and its text; when the text was the entity's name at insertion, it follows renames, otherwise (an alias, an epithet) it keeps its text. A trashed entity's mentions render as plain text and its tags are hidden; restoring brings both back. Mentions pasted from another project, or pointing to ids that do not exist, become plain text on save. Interview answers are plain text and have no mentions; premise, fabula, setting, notes, codex entries and free-text sections accept mentions without creating tags.

### 5.4 Linking two characters in the relation map

1. Relations, "Nuova mappa": the first map is named "Mappa principale" by default; the canvas is empty.
2. "Aggiungi" opens a picker across characters, locations, objects and groups (search, multi-select, grouped by type). Elsa and Tobia are added and placed in free positions around the centre.
3. Desktop: dragging from Elsa's handle onto Tobia opens the "Nuova relazione" slideover. Keyboard and phone: select Elsa, "Collega a...", choose Tobia (or any other entity, which is then added to the map too).
4. The form reads as two sentences: "Tobia è ___ di Elsa" (label, here "padre") and "Elsa è ___ di Tobia" (reverse label, "figlia"); kind (only the kinds valid for the pair, section 7.12), mutual or directed (default by kind), description. "Salva".
5. The edge appears with the kind's colour and the label text. Elsa's sheet lists "Tobia · padre"; Tobia's lists "Elsa · figlia". An empty label falls back to the kind label.
6. A second relationship between the same pair (for example a rivalry) is stacked on the same edge as a second label.
7. "Togli dalla mappa" on a node removes it from this map only, with an undo toast. "Elimina relazione" on an edge moves the relationship to the trash after a confirmation that says "La relazione sparirà da tutte le mappe e dalle schede."

Edge cases: a node cannot link to itself; kinds that do not fit the pair are not offered; a map only draws relationships among its own nodes (P1: a node shows "+2 relazioni fuori mappa" with "Aggiungi i collegati"); every map edit has an equivalent in the Elenco tab of Relations.

### 5.5 Game branching: adding a choice, spotting an unreachable scene

1. In "Dialogo con Oren", details panel, Scelte, "Aggiungi scelta". The same form opens from the flow graph by dragging from a node's handle to another node, or from a node's menu.
2. The choice form (slideover on desktop, drawer on phone):
   - **Porta a**: scene picker searching titles and codes, showing the chapter; "Nuova scena..." creates a `planned` scene with the typed title in the same chapter, right after the source.
   - **Testo della scelta**: what the player reads ("Dille la verità"). Left empty, the choice is a continuation shown as "Continua".
   - **Condizione** (with `variables`): "Aggiungi condizione" adds a clause: variable, operator by type (boolean: è vero, è falso; number: =, ≠, <, ≤, >, ≥; string: è uguale a, è diverso da), value. Several clauses are joined by "tutte" or "almeno una". One level only, no nesting.
   - **Effetti** (with `variables`): rows of variable, operation (boolean: diventa vero, diventa falso, si inverte; number: diventa, aumenta di, diminuisce di; string: diventa) and value.
   - At the bottom, the choice as a sentence: "Se fiducia_oren è almeno 3: «Dille la verità», verso «La porta si apre». Poi detto_la_verita diventa vero."
3. When this is the source scene's first explicit choice and the scene used to continue to the next scene in manuscript order, the form says so ("Finora questa scena proseguiva verso «Il mercato».") and offers an unticked "Aggiungi anche una scelta verso «Il mercato»". Unticked, the implicit continuation disappears and the checks will flag anything that becomes unreachable.
4. "Salva". The choice appears in the panel and as a solid edge in the flow, labelled with its text and a lock icon when it has a condition. Choices are ordered (drag or `Alt+Up/Down`); the order is the order the player sees.
5. Checks run whenever scenes, choices or variables change and are current whenever the flow page is open; the sidebar badge and the overview line update within a few seconds:
   - **Errors**: no start scene; a choice pointing to a trashed scene; a condition or effect using a trashed variable.
   - **Warnings**: unreachable scene; unreachable ending (listed on its own because it matters most); dead end (a reachable scene that is not an ending and has no usable way out); a choice with empty text in a scene that has more than one choice. P1: a variable used in conditions that no effect ever changes.
6. **Reachability**: start from the start scene; follow every explicit choice whatever its condition (a condition makes a path possible, not certain) and every implicit continuation; skip trashed scenes. Every scene not visited is unreachable. An ending has no implicit continuation; it may still have explicit choices (a "Riprova", for example).
7. The author sees "1" on Flow in the sidebar, opens Controlli, reads "«Il tetto» non è raggiungibile dalla scena iniziale.", and has three actions: "Mostra" (centres the node), "Apri scena", "Aggiungi una scelta che porta qui" (the choice form with the target preset and the source to choose).

Edge cases: reordering scenes in the manuscript changes implicit continuations and the checks follow; trashing a scene leaves the choices that point to it in place, flagged as errors, and restoring it heals them; deleting a scene forever deletes the choices that point to it, and the confirmation says how many.

### 5.6 Writing dialogue lines (module `script`)

1. In a scene, `/` then "Battuta" (or the writing-bar button). A line block appears with the speaker field focused.
2. Speaker: a picker of characters, the scene's first; free text is allowed for unnamed voices ("Guardia 2"), shown with a dotted underline and a one-click "Crea come comparsa". Free-text speakers create no tag.
3. Tab moves to the direction (optional, shown in italics, for example "sottovoce"), Tab again to the line.
4. Enter at the end of a line creates the next line block with the speaker set to the one before last, so a two-person exchange alternates by itself. Enter on an empty line block turns it back into a paragraph.
5. Each line gets its id at creation, `{sceneCode}-L{nnn}`, from a per-scene counter that never goes back. The id shows on hover or focus in monospace, with "Copia ID".
6. Ids are unique across the active revisions of the project. On save (and when a revision becomes active), a line whose id is already used elsewhere receives a new id from the current scene's counter: a pasted copy gets a new id, a cut-and-pasted line keeps its own. A new revision copies its lines with the same ids (it is the same line, revised).

### 5.7 Revisions of a scene

1. In the editor, "Revisioni" opens the panel: the revisions with their name, date and words; the one in use is marked "In uso".
2. "Nuova revisione" copies the active text into "Revisione 2", which becomes active and opens in the editor. The earlier one stays and stays editable.
3. Rename inline. "Usa questa revisione" on another one makes it active: word counts, tags, analysis and exports follow the active revision. Switching does not count as words written or removed.
4. Each revision has a **Cronologia**: the server stores a version when a save arrives more than 10 minutes after the last stored version, and always before a bulk change (replace all, project-wide replace, conflict handling, import). It keeps the last 50 per revision and one per day beyond that. Each version shows date, time and words, opens a read-only preview, and has "Ripristina come nuova revisione", which never overwrites.
5. P1: "Confronta" two revisions, or a version and the current text: inline differences, added text underlined and labelled, removed text struck through and labelled.
6. "Elimina" works on any revision except the active one, and one revision always remains; it goes to the trash.

Revisions never change the scene status.

### 5.8 Focus mode

1. In the editor, "Concentrazione" or `Cmd/Ctrl+Shift+Enter`.
2. Sidebar, top bar, writing bar and panels hide. The text column stays centred at the chosen width on a plain background.
3. Desktop: a thin top strip (exit, save state, options) appears when the pointer reaches the top or a shortcut is used, and hides after two seconds without movement; with reduced motion it appears and disappears without animation.
4. Bottom right, quietly: session words ("+412") and the save state; both can be hidden from the strip.
5. `Esc` leaves focus mode and restores the previous layout, panels included.
6. When changes have been unsaved for more than 10 seconds, "Non salvato, riprovo" appears whatever is hidden.
7. Phone: the top bar hides, a "Fine" button stays at the top right, the keyboard toolbar remains.
8. P1: typewriter scrolling, dimming of the other paragraphs, previous and next scene without leaving focus, browser full screen.

### 5.9 Finding anything

1. `Cmd/Ctrl+K` anywhere in a project, or the search icon on phone. With no query: the last eight opened items and the main actions (Nuova scena, Nuovo personaggio, Nota veloce, Modalità concentrazione, Esporta, Cambia tema).
2. Typing "mar" shows grouped results, case- and accent-insensitive: Personaggi (Marta; a match on an alias shows the alias), Scene ("Il mare d'inverno"), Luoghi (Marsiglia), and so on. Enter opens.
3. The last row, "Cerca «mar» nel testo", opens `/search?q=mar`: full text across the active revisions of scenes, synopses, premise, fabula, setting, notes, profile answers and free text, descriptions and codex entries. A scene result opens the editor scrolled to the occurrence, highlighted, with the find bar holding the query.
4. In the editor, `Cmd/Ctrl+F` opens the find bar: match case, whole word, "3 di 12", Enter and Shift+Enter to move; the replace field offers "Sostituisci" and "Sostituisci tutto" in this scene, and a version is stored before "Sostituisci tutto".
5. P1, project-wide replace on the search page: a replacement field, every occurrence with a ticked checkbox, "Sostituisci le selezionate (12)". The server first stores a version of every affected revision; afterwards a toast reads "12 sostituzioni in 5 scene" with "Annulla". Replace never touches mentions or dialogue speakers, and never trashed items.

### 5.10 Exporting

1. Export, from the sidebar or the palette.
2. Choose "Manoscritto" (game: "Copione"), then the format: DOCX (default), PDF, EPUB, TXT.
3. Options (appendix D): title page; part and chapter titles; scene titles (off by default for novels); scene separator; which scenes (every scene with text by default, or only `revised` and `final`, or only `final`); for DOCX and PDF the layout "Cartella editoriale" (the Italian standard manuscript page) or "Libro".
4. "Esporta": the server builds the file and the browser downloads `titolo-2026-10-18.docx`. The export is recorded with its format, date and whether every scene was `final` and the flow checks were clean (the path's last stage reads this).
5. Game projects also offer "Formati per il team" (JSON, Twee 3, Ink, voice-over CSV) and the narrative design document; every project offers "Backup del progetto".
6. Errors: a failure shows the reason with "Riprova" and "Scarica un backup"; a selection with nothing in it disables the button and says why ("Nessuna scena con testo con questi criteri").
7. Importing a backup always creates a new project; it never overwrites an existing one.

### 5.11 Saving, offline and conflicts

1. Rich text autosaves one second after the last keystroke and at least every ten seconds during continuous typing; other fields on blur or after one second idle.
2. The client writes pending content to local storage (IndexedDB) before sending and clears it when the server confirms.
3. The save state is always visible where text is edited: "Salvato", "Salvataggio...", "Non salvato, riprovo" (retries with backoff, the text stays local), "Conflitto".
4. Every save of a scene revision or of a long text (premise, fabula, setting, notes, codex entries, free-text sections, descriptions) carries the version it was based on. If the server holds a newer version, nothing is overwritten:
   - scene revision: the incoming text becomes a new, inactive revision named "Conflitto del 18 ott, 14:32", and the editor says "Questa scena è stata modificata da un altro dispositivo. Il tuo testo è salvo nella revisione «Conflitto del 18 ott, 14:32»." with "Usa la mia versione" (and "Confronta", P1);
   - other long texts: the incoming text is saved as a note titled "Conflitto: Premessa, 18 ott 14:32", and the page says so with a link to the note.
   Short fields (names, titles, single answers, selects) use last write wins.
5. When the tab regains focus or the connection returns, the open page refetches; a pending local save meets the rule above and is never dropped.
6. Closing the tab while a save is pending triggers the browser's leave-page warning.
7. Offline, the open scene stays editable and pending text queues locally; opening a page that was not loaded shows "Sei offline: questa pagina tornerà disponibile appena sei di nuovo in linea." Full offline use is P2.

---

## 6. Features by area, with priority

P0 ships in this build and must not depend on anything marked P1. P1 ships if time allows, in the order listed. P2 is later; do not start it.

**Cross-cutting**
- P0: Italian and English through i18n, with the medium-aware vocabulary helper; light, dark and system themes; WCAG 2.2 AA as in PRODUCT.md; the phone layouts of section 4; the shortcuts of section 0; data on the server for every device (refetch on focus, the conflict rule of 5.11); localised numbers and dates; every project visible to its owner only.
- P1: the shortcut sheet lists go-to sequences (`G` then `C` for characters, and so on).
- P2: live updates pushed between open devices; full offline use.

**Account and projects**
- P0: sign up, sign in, sign out (email and password); account page (name, password change with the current password, language, theme, timezone, editor typography defaults, guidance default); delete account (typed confirmation, offers a backup first, destroys everything); projects list; create blank, from a template, or a demo; rename; delete a project (to "Eliminati", restorable) and delete it forever; after sign-in, open the last opened project.
- P1: password reset and email verification (need an email transport); change email; duplicate a project; one archive with every project.
- P2: social sign-in, two-factor authentication, project covers, sharing and collaborators.

**Overview and goals**
- P0: overview (resume, path, today, deadline line, recent items, flow line for games); goals (total words, daily words, deadline); daily stats (written, removed, end-of-day total, in the account's timezone); 30- and 90-day history as bars and table; monthly averages; trend and projected finish date.
- P1: writing sessions (start, end, words per session).
- P2: reminders.

**Architecture**
- P0: premise, fabula and setting as rich text with planning status and word count; the "Cos'è" explanations for these three; strands with kind, colour from a named palette, status, description and order; the strand sheet with its scenes; notes.
- P1: pinned notes; strand filter in the outline.

**Characters and categories** (the categories are the three importance levels; free labels are P2 because groups already gather characters)
- P0: create, edit, reorder, trash; importance; aliases; one-line description; planning status; the profile sections in interview or free-text mode for `main`; description for `secondary` and `minor`; qualities, flaws, contradictions; images (upload, gallery, primary, caption); relationships, groups and appearances on the sheet; the mention card; game projects: "Giocabile", the `gameplay` and `voice` sections, with `voice` open to every importance level.
- P1: hint lines under questions; "Usa le risposte come traccia"; birth and death as story dates, shown on the timeline; lines and words spoken (with `script`).
- P2: custom interview questions; free labels; age in a scene computed from the birth date.

**Groups**
- P0: create, edit, reorder, trash; kind, status, colour, description, language, traditions, powers; members through `membership` relationships (characters with a role, locations, objects); images; relationships with other groups.
- P1: the scenes where members appear.
- P2: groups inside groups.

**Locations**
- P0: create, edit, reorder, trash; nation, region, city, status, description, images; significant events; the scenes set there; the characters linked by `place`.
- P1: list grouped by nation and region.
- P2: nested locations; maps with pins.

**Objects**
- P0: create, edit, reorder, trash; status, description, images, events, owners, the scenes where it appears.
- P2: game item attributes.

**Relations and mind maps**
- P0: global relationships with kind (valid pairs only), label, reverse label, mutual or directed, description; maps with saved node positions; adding nodes; linking by drag and by "Collega a..."; editing and trashing relationships; legend; the Elenco tab as the full alternative.
- P1: "+N relazioni fuori mappa" with "Aggiungi i collegati"; moving nodes with the arrow keys; automatic layout.
- P2: map export as an image.

**Manuscript structure**
- P0: optional parts (acts), chapters (title, purpose, notes), scenes (title, synopsis, status); drag and drop for reordering and for moving scenes between chapters and chapters between parts, with `Alt+Up/Down` and "Sposta in..."; inline rename and status; words per scene, chapter, part and total; the chapter reading view; automatic first chapter.
- P1: multi-select of scenes; outline filters; duplicate a scene.
- P2: corkboard; split and merge scenes.

**Scene editor**
- P0: the UEditor writing surface with bold, italic, underline, strikethrough, quote, lists, separator, alignment; bubble menu, `/` menu, `@` mentions; dialogue punctuation buttons; smart typography (quotes in the project's style, `--` to —, `...` to …); browser spell check in the manuscript language; words and characters (with and without spaces); session words; autosave with visible state, local buffer, conflict rule; the details panel with every tag; revisions (create, rename, use, delete); automatic history with restore; find and replace in the scene; focus mode; typography controls (serif or sans, size, line height, width) from an "Aa" menu; paste cleanup (keeps paragraphs, bold, italic; drops fonts and colours).
- P1: compare revisions; typewriter scrolling; dim other paragraphs; selection word count; browser full screen.
- P2: inline comments; tracked changes.

**Timeline**
- P0: events (story or historical, date, date label, duration, description, links to characters, locations, objects, groups); the chronological list of dated scenes and events with grouping and filters; the undated tray; giving a scene a date from the timeline.
- P1: overlap warnings (a character in two different locations at overlapping times); narrative order beside story order.
- P2: invented calendars; a horizontal zoomable timeline.

**Analysis**
- P0: chapter lengths; characters, locations, objects and strands by chapter; point of view and POV character by chapter; status by chapter; a cell opens its scenes.
- P1: the game tab (scene kinds per act, choices per scene, endings, lines and words per speaker).

**Game modules**
- Branching and flow, P0: choices with text, structured condition, effects and order; start scene; endings with a label; implicit continuation; the flow graph (columns per chapter, draggable, positions saved), the list view and the checks; the sidebar badge; incoming choices in the scene details. P1: the "variable never changed" check; flow filters by act and strand. P2: a play-through mode; several start points; branching inside a scene.
- Quests, P0: kinds `quest` and `side_quest`; giver; objectives with optional flag, completing scene and computed check; rewards with an optional object. P2: prerequisites between quests.
- Variables, P0: create, edit, reorder, trash; name rules; type; default; description; where used; references by id. P1: grouping variables.
- Codex, P0: categories (seven defaults) and entries with mentions. P1: "Citata in" backlinks; images on entries.
- Dialogue lines, P0: the line block with speaker, direction and text; stable ids; alternating speakers; speaker tags; the voice-over CSV. P2: localisation string tables.
- Scene kinds, P0: the kind field, its icon in the outline and the flow.

**Search**
- P0: command palette (sections, entities by name and alias, actions); the project search page; find and replace in a scene.
- P1: project-wide replace.

**Trash**
- P0: everything deletable goes to the trash first (scenes, chapters, parts, characters, groups, locations, objects, strands, notes, codex entries and categories, events, relationships, maps, variables, choices, revisions, images); units move together (a chapter with its scenes) and come back together; restore to the original place, or to a "Ripristinati" chapter when the place is gone; delete forever; empty the trash; trashed things are invisible everywhere else.
- P2: automatic purge after a chosen period.

**Export and import**
- P0: manuscript as DOCX, PDF, EPUB, TXT; the project document as DOCX (story bible for novels, narrative design document for games); JSON, Twee 3 (Harlowe 3), Ink, voice-over CSV; project backup and its import as a new project, lossless; export records.
- P1, in this order: bibisco project import; DOCX and Markdown manuscript import (headings become parts, chapters and scenes); project document as PDF; Twee 3 for SugarCube 2; EPUB cover image.
- P2: Scrivener import; Fountain and Final Draft export; Yarn Spinner export; scheduled backups.

**Settings**
- P0: general, type, modules, writing, structure, guidance, delete project.
- P2: custom vocabulary.

**Onboarding and demo**
- P0: every empty state of section 4; the path; three novel templates and three game templates (appendix B); the novel and game demos in Italian and English (appendix C); the shortcut sheet.
- P1: hint lines under interview questions.

---

## 7. Data requirements

Product requirements, not a schema: what each entity must hold and link to. Engineering chooses tables and types. Keys of enumerations are the fixed ones.

### 7.0 Common to every entity

- Stable id; the project it belongs to; created and updated times.
- Trashable entities carry when they were trashed and a **trash batch**: everything trashed by one action shares a batch and is restored together (a chapter with its scenes; a character with its profile and images, while their relationships and tags are merely hidden).
- Ordered entities carry a position within their container.
- Long texts (rich text fields) carry a version number for the conflict rule of 5.11.
- **Rich text** is stored as the editor's JSON. The server derives plain text from it for search, counts and exports. A mention is a node holding the entity type, the entity id, the text shown, and whether that text follows the entity's name.
- **Colours** come from a named palette shared by strands, groups and relationship kinds: `brick` (Mattone, Brick), `amber` (Ambra, Amber), `ochre` (Ocra, Ochre), `olive` (Oliva, Olive), `green` (Verde, Green), `teal` (Verde acqua, Teal), `blue` (Blu, Blue), `indigo` (Indaco, Indigo), `plum` (Prugna, Plum), `slate` (Ardesia, Slate). Design sets the shades for both themes at 3:1 against the background.

### 7.1 Account
Email (unique, case-insensitive); password (hashed); name; UI language (`it`, `en`); theme (`light`, `dark`, `system`); timezone (IANA, from the browser at sign-up); editor typography (font `serif` or `sans`; size 14 to 24 px, default 18; line height 1.4 to 2.0, default 1.6; line width narrow 60ch, medium 70ch default, wide 80ch); guidance default (yes); last opened project.

### 7.2 Project
Owner; title; subtitle; author name for exports; type (`novel`, `game`); enabled modules (subset of the six keys); manuscript language (BCP 47, default the UI language); dialogue punctuation (`guillemets`, `double_quotes`, `dash`); smart typography (yes); uses parts (no for novels, yes for games); guidance shown; start scene (with `branching`); IFID (a UUID generated once, used by the Twee export); premise, fabula and setting, each a rich text with planning status; goals (total words, daily words, deadline date, each optional); next scene code number; last opened time; deleted time (deleted projects stay restorable until deleted forever).

### 7.3 Strand
Title; kind; colour; description (rich text); planning status; position. Kind `arc`: the character whose arc it is. Kinds `quest` and `side_quest`: giver (character); objectives, ordered, each with text, optional flag and completing scene; rewards, ordered, each with text and an optional object. Fields of other kinds are kept when the kind changes and shown again when it changes back. Scenes link to strands through the scene's strand list.

### 7.4 Note
Title; body (rich text); position; P1 pinned flag.

### 7.5 Character
Name (required); aliases (list); importance; planning status; one-line description (up to 140 characters); description (rich text, for `secondary` and `minor`, kept for `main`); qualities, flaws, contradictions (three ordered lists of short texts up to 200 characters); playable (game); notes (rich text); position within its importance group; images. P1: born and died, as story dates.

### 7.6 Profile section
One per character and section key: mode (`interview` or `free`); answers (question key from appendix A to plain text); free text (rich text). Availability: `main` characters see the nine shared sections, plus `gameplay` and `voice` in game projects; `secondary` and `minor` characters see `voice` in game projects and no section in novels. Content is never deleted when a section becomes unavailable.

### 7.7 Group
Name; kind; planning status; colour; description, language, traditions, powers (rich text each); images; position. Members are `membership` relationships pointing to the group.

### 7.8 Location
Name; nation; region; city; planning status; description (rich text); images; position. Significant events are events linked to the location.

### 7.9 Object
Name; planning status; description (rich text); images; position. Events are events linked to the object; owners are `ownership` relationships.

### 7.10 Image
Owner (character, group, location, object; P1 codex entry); the file (JPEG, PNG or WebP, up to 10 MB uploaded, stored resized to at most 2400 px on the longest side plus a thumbnail); caption; alternative text (defaults to the caption); position. The first by position is the primary image. Images belong in backups and in the project document.

### 7.11 Relationship
From (entity type and id); to (entity type and id); kind; label (what `from` is to `to`: "padre"); reverse label (what `to` is to `from`: "figlia"); mutual or directed; description. Several relationships may join the same pair; an entity cannot relate to itself.

### 7.12 Valid kinds by pair

| From → to | Kinds offered |
|---|---|
| character ↔ character | family, romance, friendship, alliance, rivalry, enmity, mentorship, professional, other |
| character → location | place, ownership, other |
| character → object | ownership, other |
| character → group | membership, alliance, rivalry, enmity, professional, other |
| location → group, object → group | membership, other |
| group ↔ group | alliance, rivalry, enmity, other |
| group → location | place, ownership, other |
| group → object | ownership, other |
| location ↔ location, object → location | place, other |
| object ↔ object | other |

Default direction: `mentorship`, `ownership`, `place` and `membership` are directed (mentor to pupil, owner to thing, who or what to the place, member to group); the others are mutual. The author may change it.

### 7.13 Relation map
Name; position; nodes, each an entity (type and id) with x and y. Nodes whose entity is trashed are hidden and come back on restore. Edges are not stored on the map: they are the relationships among its nodes.

### 7.14 Codex category and entry
Category: name; position. Entry: title; category (required; trashing a category trashes its entries in the same batch); body (rich text); position; P1 images.

### 7.15 Part and chapter
Part (act): title; description (short rich text); position. Chapter: its part (always set when the project uses parts, never when it does not); title; purpose (short rich text); notes (rich text); position. Turning parts on puts every chapter into a new "Parte prima" (or "Atto I"); turning them off keeps the chapters in their current order and moves the parts to the trash in one batch, so turning parts back on and restoring the batch rebuilds them.

### 7.16 Scene
Chapter; title; synopsis (plain text up to 500 characters); status; position; **code** (`S` plus at least three digits from the project counter, assigned at creation, never changed, never reused); kind (default `scene`, used with `scene_kinds`); point of view (nullable); POV character (nullable); strands (list); **story start** (a date with optional time, years from −9999 to 9999, with a precision of year, month, day or minute so "1953" and "14 novembre 1953, 22:10" both sort correctly); date label (free text shown instead of the formatted date, for invented calendars: "Terza luna dell'anno 312"); duration (number and unit: minutes, hours, days, weeks, months, years); notes (rich text); ending flag and ending label (with `branching`); flow position (nullable x and y); active revision; next line number (with `script`); last edited time. Words and characters (with and without spaces) are derived from the active revision.

### 7.17 Scene tag
Scene; entity (character, location or object); **manual** (yes or no); **mentions** (count in the active revision); **lines** (count of dialogue lines spoken, characters only). The tag exists while any of the three is set. The server recomputes mentions and lines on every save and on revision switch; removing a tag from the panel clears only `manual`.

### 7.18 Revision and stored version
Revision: scene; name; content (rich text); words and characters; version number; position. A scene always has at least one revision and exactly one active. Stored version (the Cronologia): revision; content; words; time; reason (`auto`, `before_bulk`, `conflict`, `restore`). Retention: the last 50 per revision, then one per day.

### 7.19 Choice
From scene; to scene; text (up to 300 characters, empty means a continuation); condition (nullable: mode `all` or `any`, and clauses of variable, operator and value); effects (ordered list of variable, operation and value); position among the choices of the source scene. Operators: `is_true`, `is_false` (boolean); `eq`, `neq`, `lt`, `lte`, `gt`, `gte` (number); `eq`, `neq` (string). Operations: `set`, `toggle` (boolean); `set`, `add`, `subtract` (number); `set` (string). Values are typed by the variable.

### 7.20 Variable
Name (lowercase letters, digits and underscores, starting with a letter, up to 40 characters, unique among the project's non-trashed variables); type (`boolean`, `number`, `string`); default (false, 0, empty unless set; numbers are integers); description; position. Conditions and effects point to the variable by id, so renaming changes nothing else.

### 7.21 Dialogue line
Not a separate record: a block inside the revision content with line id, speaker character (nullable), speaker label (free text, used when there is no character and as a fallback), direction (plain text) and the line text (inline rich text). The server reads lines from the active revisions for tags, counts, checks and exports.

### 7.22 Event
Title; kind (`story` or `historical`); story start (same format as scenes); date label; duration; description (rich text); linked characters, locations, objects and groups. An event without a date appears on the sheets it is linked to and in the timeline's undated tray.

### 7.23 Writing stats
Per project and day (the day in the account's timezone at the time of the save): words written (sum of positive deltas of editor saves), words removed (sum of negative deltas), total words at the last save of the day. Not counted: imports, templates, demo creation, restores, revision switches, conflict revisions, replace operations. Days without saves have no record; the history shows them as zero.

### 7.24 Export record
Project; what (`manuscript`, `document`, `json`, `twee`, `ink`, `vo_csv`, `backup`); format; time; every scene `final` at the time (yes or no); flow checks clean at the time (game). The file itself is not kept.

### 7.25 Backup archive
A `.zip` with one JSON document (format name and version, the project and every record above, trashed ones included) and the image files. Import creates a new project with new ids, keeps scene codes and line ids, and reproduces the project exactly: an export, import and second export must produce the same JSON apart from ids and times. This round trip is the acceptance test of the backup.

---

## 8. Explicitly out of scope

Not in this build, and not to be started. Where an item is P2 above, it is listed here so that nobody builds a "small version" of it.

- **AI of any kind**: generation, rewriting, summaries, suggestions, "smart" names, writing prompts produced by a model. The author writes; Dramatis organises.
- **Collaboration**: shared projects, several authors, editor comments, real-time co-editing, public links. One project, one author.
- **Branching inside a scene**: there is no dialogue-tree editor. A conversation with options is a `dialogue` scene whose choices lead to short scenes.
- **A game runtime**: no play-through simulator (P2), no engine plugins (Unity, Unreal, Godot), no articy or Yarn Spinner formats.
- **Invented calendars** with their own months and years. The date label covers how a date reads; ordering uses the real-calendar date the author enters.
- **Full offline use**, installable app, native apps.
- **Payments, plans, quotas**, admin console.
- **Publishing**: store distribution, ISBN, print typesetting beyond the two layouts, cover design.
- **Grammar and style checking** beyond the browser's spell check; custom dictionaries.
- **Scrivener import**, Fountain and Final Draft export, tracked changes, inline comments (all P2).
- **Corkboard** and other card-grid views of the manuscript.
- **Gamification**: streak badges, achievements, confetti, encouragement with exclamation marks.
- **Email** of any kind beyond P1 password reset and verification: no reminders, no newsletters.
- **Third-party analytics in the app**: no script that can read what the author writes; nothing about the content leaves the server.
- **Inference from the text**: no automatic relationships, no detected characters, no tags beyond explicit mentions and speakers.

---

## 9. Open questions, and how we will know it worked

### 9.1 Open questions

1. **Email transport.** Without one there is no password reset, and a forgotten password locks an author out of their manuscript. Until a provider is chosen, the account page must recommend downloading backups. If the launch is public, reset moves to P0. Settled by: an infrastructure decision before launch.
2. **Image storage and quota.** Database, disk or object storage, and whether accounts get a quota. This build caps files at 10 MB and sets no quota. Settled by: the engineering lead with infrastructure; revisited with real usage.
3. **bibisco import.** The structure of bibisco 2 and 3 archives must be read from real files. Without sample archives from real projects, the P1 importer cannot be verified. Settled by: three or four archives from experienced authors.
4. **Twine story format.** Harlowe 3 is the default because Twine ships with it; variable-heavy games often use SugarCube. Settled by: asking a handful of game writers which one their team uses.
5. **"Fazioni" for groups in games.** Standard in lore bibles, odd for a family. Settled by: narrative designers' reaction to the game demo.
6. **Implicit continuation.** Right for linear stretches, possibly surprising after a reorder. Watch whether authors are confused when a reorder makes a scene unreachable.
7. **Branching inside a scene.** The largest gap for dialogue-heavy games. The signal to build it: game writers splitting conversations into many tiny scenes to imitate a dialogue tree.
8. **Words written and pasting.** Pasted text counts as written. Revisit if authors complain that pasting an old chapter inflates the day.
9. **Measurement.** Every indicator below needs counts we do not collect yet. A decision is needed on privacy-safe server-side counters (events and numbers only, never content).
10. **Demo content.** The demo is the first impression and needs a human writer's pass in both languages after the engineering draft.

### 9.2 How we will know it worked

- First-time novelist: the share of new projects that complete the protagonist stage within 7 days, and the first draft within 90.
- Experienced author: the share of projects created by import that are still being edited 30 days later.
- Game writer: the share of game projects with at least one team export made with clean checks.
- Trust: no report of lost text. Conflict revisions being created now and then is the safety net working; a high number means sync needs work.

---

## Appendix A. Interview questions

The interview speaks to the character, in the second person, as in bibisco. Answers are stored by key, so the order and wording can change without losing anything. A key removed in a later version keeps its answer visible under "Altre risposte".

### `personal`, Dati personali / Personal data

| Key | Italiano | English |
|---|---|---|
| `personal.full_name` | Come ti chiami, per intero? | What is your full name? |
| `personal.nickname` | Hai un soprannome? Chi lo usa? | Do you have a nickname? Who uses it? |
| `personal.age` | Quanti anni hai quando la storia comincia? | How old are you when the story begins? |
| `personal.birth` | Dove e quando sei nato? | Where and when were you born? |
| `personal.home` | Dove vivi, e con chi? | Where do you live, and with whom? |
| `personal.occupation` | Che lavoro fai, e come ti mantieni? | What do you do, and how do you make a living? |
| `personal.family` | Chi è la tua famiglia? | Who is your family? |
| `personal.education` | Che studi hai fatto? | What schooling have you had? |

### `physical`, Aspetto fisico / Physical features

| Key | Italiano | English |
|---|---|---|
| `physical.build` | Quanto sei alto, e com'è la tua corporatura? | How tall are you, and what is your build? |
| `physical.face` | Com'è il tuo viso? | What is your face like? |
| `physical.eyes` | Di che colore sono i tuoi occhi? | What colour are your eyes? |
| `physical.hair` | Come sono i tuoi capelli? | What is your hair like? |
| `physical.marks` | Hai segni particolari: cicatrici, tatuaggi, nei? | Any distinguishing marks: scars, tattoos, moles? |
| `physical.clothing` | Come ti vesti, di solito? | How do you usually dress? |
| `physical.movement` | Come ti muovi? Hai gesti tipici? | How do you move? Any typical gestures? |
| `physical.health` | Come stai di salute? | How is your health? |
| `physical.first_impression` | Cosa nota per prima cosa chi ti incontra? | What do people notice first when they meet you? |

### `behavior`, Comportamenti e atteggiamenti / Behaviours and attitudes

| Key | Italiano | English |
|---|---|---|
| `behavior.habits` | Quali abitudini hai? | What are your habits? |
| `behavior.day` | Com'è una tua giornata tipo? | What does a typical day look like for you? |
| `behavior.speech` | Come parli? Hai intercalari, modi di dire? | How do you speak? Any pet phrases? |
| `behavior.strangers` | Come ti comporti con chi non conosci? | How do you behave with strangers? |
| `behavior.pressure` | Cosa fai quando sei sotto pressione? | What do you do under pressure? |
| `behavior.quirks` | Hai tic, manie, superstizioni? | Any tics, quirks or superstitions? |
| `behavior.money` | Che rapporto hai con il denaro? | What is your relationship with money? |
| `behavior.alone` | C'è qualcosa che fai solo quando nessuno ti vede? | Is there something you do only when nobody is watching? |

### `psychology`, Psicologia / Psychology

| Key | Italiano | English |
|---|---|---|
| `psychology.temperament` | Come descriveresti il tuo carattere? | How would you describe your temperament? |
| `psychology.fear` | Di cosa hai più paura? | What do you fear most? |
| `psychology.desire` | Cosa desideri più di ogni altra cosa? | What do you want more than anything else? |
| `psychology.shame` | Di cosa ti vergogni? | What are you ashamed of? |
| `psychology.anger` | Cosa ti fa arrabbiare? | What makes you angry? |
| `psychology.self_image` | Come ti vedi? E come ti vedono gli altri? | How do you see yourself, and how do others see you? |
| `psychology.lie` | Quale bugia racconti a te stesso? | What lie do you tell yourself? |
| `psychology.happiness` | Quando sei stato davvero felice? | When were you truly happy? |

### `ideas`, Idee e passioni / Ideas and passions

| Key | Italiano | English |
|---|---|---|
| `ideas.beliefs` | In cosa credi? | What do you believe in? |
| `ideas.faith_politics` | Che idee hai sulla religione e sulla politica? | What are your views on religion and politics? |
| `ideas.passions` | Cosa ami fare? | What do you love doing? |
| `ideas.tastes` | Libri, musica, cibo: cosa ti piace? | Books, music, food: what do you like? |
| `ideas.dislikes` | Cosa non sopporti? | What can't you stand? |
| `ideas.dream` | Che sogno tieni nel cassetto? | What dream do you keep to yourself? |
| `ideas.stake` | Per cosa saresti disposto a rischiare tutto? | What would you risk everything for? |

### `sociology`, Sociologia / Sociology

| Key | Italiano | English |
|---|---|---|
| `sociology.origin` | Da che ambiente sociale vieni? | What social background do you come from? |
| `sociology.now` | E oggi, a quale ambiente appartieni? | And where do you belong now? |
| `sociology.community` | Di quale comunità fai parte? | Which community are you part of? |
| `sociology.friends` | Chi sono i tuoi amici? | Who are your friends? |
| `sociology.enemies` | Chi ti è ostile? | Who is against you? |
| `sociology.love` | Com'è la tua vita sentimentale? | What is your love life like? |
| `sociology.reputation` | Che reputazione hai? | What is your reputation? |
| `sociology.role` | Che ruolo hai nel tuo gruppo? | What role do you play in your group? |

### `backstory`, Vita prima della storia / Life before the story

| Key | Italiano | English |
|---|---|---|
| `backstory.childhood` | Com'è stata la tua infanzia? | What was your childhood like? |
| `backstory.parents` | Che rapporto avevi con i tuoi genitori? | What was your relationship with your parents? |
| `backstory.turning_point` | Quale evento ti ha cambiato la vita? | Which event changed your life? |
| `backstory.wound` | Qual è la ferita che ti porti dietro? | What wound do you carry? |
| `backstory.first_love` | Chi è stato il tuo primo amore? | Who was your first love? |
| `backstory.regret` | Di cosa ti penti? | What do you regret? |
| `backstory.just_before` | Cosa stavi facendo poco prima che la storia cominci? | What were you doing just before the story begins? |

### `conflict`, Conflitto / Conflict

| Key | Italiano | English |
|---|---|---|
| `conflict.want` | Cosa vuoi ottenere in questa storia? | What do you want to achieve in this story? |
| `conflict.need` | Di cosa hai davvero bisogno, anche se non lo sai? | What do you really need, even if you don't know it? |
| `conflict.obstacle` | Cosa o chi ti ostacola? | What or who stands in your way? |
| `conflict.stakes` | Cosa perdi se fallisci? | What do you lose if you fail? |
| `conflict.inner` | Quale conflitto porti dentro di te? | What conflict do you carry inside? |
| `conflict.hardest_choice` | Qual è la scelta più difficile che dovrai fare? | What is the hardest choice you will have to make? |

### `evolution`, Evoluzione nella storia / Evolution during the story

| Key | Italiano | English |
|---|---|---|
| `evolution.start` | Chi sei all'inizio della storia? | Who are you at the start of the story? |
| `evolution.end` | Chi sei alla fine? | Who are you at the end? |
| `evolution.cause` | Cosa ti fa cambiare? | What makes you change? |
| `evolution.moment` | In quale momento capisci di essere cambiato? | At what moment do you realise you have changed? |
| `evolution.cost` | Cosa ti costa questo cambiamento? | What does this change cost you? |
| `evolution.unchanged` | Cosa resta uguale in te? | What stays the same in you? |

### `gameplay`, Ruolo nel gioco / Role in the game (game projects only)

| Key | Italiano | English |
|---|---|---|
| `gameplay.role` | Che ruolo hai nel gioco: personaggio giocabile, compagno, mercante, avversario? | What is your role in the game: playable character, companion, vendor, opponent? |
| `gameplay.first_meeting` | Dove e come ti incontra il giocatore? | Where and how does the player meet you? |
| `gameplay.abilities` | Quali abilità o poteri hai? | What abilities or powers do you have? |
| `gameplay.player_bond` | Come cambia il tuo rapporto con il giocatore in base alle sue scelte? | How does your relationship with the player change with their choices? |
| `gameplay.quests` | In quali missioni sei coinvolto, e come? | Which quests are you involved in, and how? |
| `gameplay.fates` | Che destini puoi avere, a seconda del percorso? | What fates can you meet, depending on the path? |

### `voice`, Voce e recitazione / Voice and performance (game projects only)

| Key | Italiano | English |
|---|---|---|
| `voice.pronunciation` | Come si pronuncia il tuo nome? | How is your name pronounced? |
| `voice.quality` | Com'è la tua voce: età, timbro, ritmo? | What is your voice like: age, timbre, pace? |
| `voice.accent` | Hai un accento o una cadenza? | Do you have an accent or a lilt? |
| `voice.register` | Che registro usi: formale, colloquiale, gergale? | What register do you use: formal, casual, slang? |
| `voice.catchphrases` | Hai frasi che ripeti spesso? | Do you have phrases you repeat often? |
| `voice.never_say` | Cosa non diresti mai? | What would you never say? |
| `voice.reference` | A quale voce o interprete somigli? | Which voice or performer are you like? |
| `voice.casting` | Cosa deve sapere chi ti darà la voce? | What should the person who voices you know? |

---

## Appendix B. Structure templates

A template creates structure, never prose: chapters with a purpose, one planned scene per beat with the beat as its title and the prompt as its synopsis, and for games the start scene, kinds, endings, choices and variables. Everything is created in the UI language (variable names included: the English template uses `helped_blacksmith` where the Italian uses `aiutato_fabbro`). Chapter purpose = the prompt below; scene synopsis = the same prompt.

### B.1 Novel: `three_act`, "Tre atti" / "Three acts" (parts on, 3 parts, 8 chapters)

| Part | Chapter and scene | Prompt (IT) | Prompt (EN) |
|---|---|---|---|
| Primo atto / Act one | Il mondo ordinario / The ordinary world | Mostra il protagonista nella sua vita di sempre, e cosa gli manca. | Show the protagonist's everyday life, and what is missing from it. |
| | L'incidente scatenante / The inciting incident | Succede qualcosa che rompe l'equilibrio. | Something happens that breaks the balance. |
| | La soglia / The threshold | Il protagonista sceglie di andare avanti: non si torna indietro. | The protagonist chooses to go on: there is no way back. |
| Secondo atto / Act two | Prove e alleati / Tests and allies | Il nuovo mondo lo mette alla prova; arrivano alleati e nemici. | The new world tests them; allies and enemies arrive. |
| | Il punto di mezzo / The midpoint | Una scoperta cambia il senso di ciò che cerca. | A discovery changes the meaning of the search. |
| | Tutto è perduto / All is lost | Il protagonista tocca il punto più basso. | The protagonist hits rock bottom. |
| Terzo atto / Act three | La resa dei conti / The climax | Lo scontro decisivo: usa ciò che ha imparato. | The decisive confrontation: they use what they have learnt. |
| | Il nuovo equilibrio / The new balance | Com'è cambiato il mondo, e com'è cambiato lui. | How the world has changed, and how they have. |

Also creates one `plot` strand, "Trama principale", tagged on every scene.

### B.2 Novel: `hero_journey`, "Il viaggio dell'eroe" / "The hero's journey" (parts on, 3 parts, 12 chapters)

Part "La partenza" / "Departure": Il mondo ordinario / The ordinary world; La chiamata all'avventura / The call to adventure; Il rifiuto della chiamata / Refusal of the call; L'incontro con il mentore / Meeting the mentor; Il varco della prima soglia / Crossing the first threshold.
Part "L'iniziazione" / "Initiation": Prove, alleati, nemici / Tests, allies, enemies; L'avvicinamento alla caverna più profonda / Approach to the inmost cave; La prova centrale / The ordeal; La ricompensa / The reward.
Part "Il ritorno" / "Return": La via del ritorno / The road back; La resurrezione / The resurrection; Il ritorno con l'elisir / Return with the elixir.

Prompts are one line per stage in the i18n files, in the register of B.1 (for example "Il mentore dà all'eroe ciò che gli serve per partire: un consiglio, un dono, una spinta.").

### B.3 Novel: `seven_point`, "Sette punti" / "Seven-point structure" (parts off, 7 chapters)

| Chapter and scene | Prompt (IT) | Prompt (EN) |
|---|---|---|
| Il gancio / The hook | Il protagonista all'opposto di come finirà. | The protagonist as the opposite of who they will become. |
| Prima svolta / First plot turn | Qualcosa mette in moto la storia. | Something sets the story in motion. |
| Prima stretta / First pinch | L'antagonista mostra la sua forza e costringe ad agire. | The antagonist shows their strength and forces action. |
| Il punto di mezzo / The midpoint | Il protagonista smette di subire e comincia ad agire. | The protagonist stops reacting and starts acting. |
| Seconda stretta / Second pinch | Tutto va storto: perde qualcosa di importante. | Everything goes wrong: something important is lost. |
| Seconda svolta / Second plot turn | Trova l'ultimo pezzo che gli serve. | They find the last piece they need. |
| La risoluzione / The resolution | Affronta il conflitto e lo risolve. | They face the conflict and resolve it. |

### B.4 Game: `game_three_acts`, "Tre atti con missioni secondarie" / "Three acts with side quests"

| Act | Chapter | Scene (kind) | Flow |
|---|---|---|---|
| Atto I | Prologo | S001 Apertura (cutscene), start | continues to S002 |
| | La chiamata | S002 L'incarico (dialogue) | continues to S003 |
| Atto II | Il mondo si apre | S003 L'accampamento (exploration) | choices: "Parti per la missione" to S005; "Aiuta il fabbro" (condition `aiutato_fabbro` is false) to S004 |
| | | S004 Il favore del fabbro (gameplay) | choice "Torna all'accampamento" to S003, effect `aiutato_fabbro` set true |
| | La svolta | S005 La scoperta (cutscene) | continues to S006 |
| | | S006 Lo scontro con il luogotenente (combat) | continues to S007 |
| Atto III | L'ultima prova | S007 La resa dei conti (combat) | continues to S008 |
| | Epilogo | S008 Finale (cutscene), ending "Finale" | |

Variables: `aiutato_fabbro` (boolean, false). Strands: `quest` "Missione principale" with objectives "Ricevi l'incarico" (S002), "Scopri la verità" (S005), "Affronta il nemico" (S007); `side_quest` "Il favore del fabbro" with objective "Aiuta il fabbro" (S004).

### B.5 Game: `game_branching`, "Ramificata con tre finali" / "Branching with three endings"

| Act | Chapter | Scene (kind) | Flow |
|---|---|---|---|
| Atto I | Inizio | S001 Il risveglio (cutscene), start | continues to S002 |
| | | S002 Il primo bivio (dialogue) | "Fidati dello straniero" to S003, effect `fiducia` add 1; "Vai da solo" to S004 |
| Atto II | Due strade | S003 Con lo straniero (exploration) | continuation (empty text) to S005 |
| | | S004 Da solo (exploration) | continues to S005 |
| | | S005 La convergenza (dialogue) | "Salva la città" (condition `fiducia` ≥ 1) to S006; "Fuggi" to S007; "Prendi il potere" to S008 |
| Atto III | I finali | S006 La città salva (cutscene), ending | |
| | | S007 La fuga (cutscene), ending | |
| | | S008 La corona (cutscene), ending | |

Variables: `fiducia` (number, 0). Strand: `plot` "Trama principale".

### B.6 Game: `game_hub`, "Hub con tre missioni" / "Hub with three quests"

| Act | Chapter | Scene (kind) | Flow |
|---|---|---|---|
| Atto I | L'arrivo | S001 L'arrivo al villaggio (cutscene), start | continues to S002 |
| | | S002 La piazza (exploration) | "Il faro" to S003 (condition `faro_fatto` is false); "La miniera" to S004 (condition `miniera_fatta` is false); "Il bosco" to S005 (condition `bosco_fatto` is false); "Affronta il guardiano" to S006 (condition, all: the three are true) |
| Atto II | Tre missioni | S003 Il faro (puzzle) | "Torna in piazza" to S002, effect `faro_fatto` set true |
| | | S004 La miniera (combat) | "Torna in piazza" to S002, effect `miniera_fatta` set true |
| | | S005 Il bosco (exploration) | "Torna in piazza" to S002, effect `bosco_fatto` set true |
| Atto III | Il guardiano | S006 Il guardiano (combat) | continues to S007 |
| | | S007 Epilogo (cutscene), ending | |

Variables: `faro_fatto`, `miniera_fatta`, `bosco_fatto` (boolean, false). Strands: three `quest` strands, one per mission, each with one objective completed in its scene.

---

## Appendix C. Demo projects

Each demo is an ordinary project the author can edit or delete, created in the UI language, with guidance on and the title prefixed "Esempio: " / "Example: ". Its purpose is to show how things connect, so every feature appears at least once. Scene texts are short (150 to 300 words), written for the demo in both languages, with real mentions and, in the game, real dialogue lines. Creating a demo records no writing stats. A human writer reviews both texts before launch (section 9).

### C.1 Novel: "L'inverno di Capo Nero" / "The Winter at Cape Nero"

- **Premise** (about 40 words): Elsa, diciannove anni, vuole lasciare il faro dove vive con il padre Tobia. La notte del naufragio salva uno straniero, Ivan, che sa qualcosa del passato di Tobia. Se scopre la verità, partire diventa una fuga, o una scelta.
- **Fabula** (about 120 words) and **setting** (about 50 words: an invented stretch of Ligurian coast, November 1953). Planning status: premise `done`, fabula `done`, setting `progress`.
- **Characters**: Elsa Marin (`main`, sections `personal`, `physical`, `psychology`, `conflict` answered, two qualities, one flaw, one contradiction, an image placeholder); Tobia Marin (`main`, three sections answered including `conflict`, alias "il guardiano"); Ivan Ruso (`secondary`); Ada Marin, la nonna (`secondary`); il maresciallo Ferri (`minor`).
- **Group**: Famiglia Marin (`family`) with language and traditions filled in; members Elsa, Tobia, Ada, with roles.
- **Locations**: Faro di Capo Nero; Portoscuro (the village; nation, region and city filled in); La grotta delle Sirene.
- **Objects**: Il diario di bordo (owned by Tobia; event "Ultima pagina scritta", 1934); La lanterna di scorta.
- **Strands**: "Il naufragio" (`plot`), "Il segreto di Tobia" (`subplot`), "Elsa vuole partire" (`arc`, Elsa).
- **Structure**, parts on: Parte prima "La tempesta" (chapter 1 "La notte del naufragio": S001 `final`, S002 `revised`; chapter 2 "Lo straniero": S003 `revised`, S004 `draft`); Parte seconda "Il segreto" (chapter 3 "Il diario": S005 `draft`, S006 `draft`; chapter 4 "La partenza": S007 and S008 `planned`, synopsis only). Every chapter has a purpose. Scenes are dated between 12 and 19 November 1953 with durations; point of view `third_limited`, POV character Elsa except S005 (Tobia).
- **Events**: historical "Alluvione del Polesine" (14 November 1951), linked to Ivan; story event "Tobia arriva a Capo Nero" (1934), linked to Tobia and the lighthouse.
- **Map** "Mappa principale": Tobia padre / Elsa figlia (`family`); Ada nonna / Elsa nipote (`family`); Elsa and Ivan (`friendship`); Tobia and Ferri (`rivalry`); Tobia custode of the lighthouse (`place`); Tobia owner of the diary (`ownership`); the three members of the family (`membership`).
- **Goals**: 60.000 words total, 500 a day, no deadline.
- **Resulting path**: stages 1 to 5 done, stage 6 current ("2 scene ancora pianificate").

### C.2 Game: "La chiave d'ottone" / "The Brass Key"

- **Premise**: Nina, corriera nella città portuale di Vesta, deve consegnare una chiave d'ottone prima dell'alba. Oren, il destinatario, non è chi dice di essere. Il giocatore decide se fidarsi, mentire o tenere la chiave per sé.
- **Fabula** (about 120 words) and **setting** (about 50 words: Vesta, a port city of canals and clock towers, the night before a festival).
- **Characters**: Nina (`main`, playable, sections `personal`, `conflict`, `gameplay` and `voice` answered); Oren (`main`, `voice` filled in); Mastro Anselmo, capo della gilda (`secondary`); Mira, la fornaia (`secondary`); Guardia del molo (`minor`, `voice` filled in).
- **Factions**: La Gilda dei Corrieri (`faction`: Nina, Anselmo); I Custodi (`organization`: Oren).
- **Locations**: Il molo, Il mercato, La torre dell'orologio, I tetti. **Items**: La chiave d'ottone, Il sigillo della gilda.
- **Codex** (on): "Vesta" (Storia), "La Gilda dei Corrieri" (Politica), "Le chiavi d'ottone" (Magia e tecnologia).
- **Variables**: `fiducia_oren` (number, 0), `ha_la_chiave` (boolean, true), `ha_detto_la_verita` (boolean, false), `aiutato_mira` (boolean, false).
- **Quests**: `quest` "Consegna la chiave", giver Anselmo, objectives "Raggiungi il mercato" (S002), "Incontra Oren" (S003), "Decidi cosa fare della chiave" (S005); `side_quest` "Il gatto di Mira", giver Mira, objective "Ritrova il gatto" (S004), rewards "Una pagnotta dolce" and "Il passaggio sui tetti".
- **Structure**, acts on:

| Act | Chapter | Scene (kind, status) | Flow |
|---|---|---|---|
| Atto I "La consegna" | Il molo | S001 L'arrivo al molo (cutscene, `final`), start; two lines by the Guardia del molo | continues to S002 |
| | Il mercato | S002 Il mercato all'alba (exploration, `revised`) | "Vai alla torre" to S003; "Aiuta Mira" (condition `aiutato_mira` is false) to S004 |
| | | S004 Il gatto di Mira (gameplay, `draft`) | "Torna al mercato" to S002, effect `aiutato_mira` set true |
| Atto II "La scelta" | La torre | S003 Dialogo con Oren (dialogue, `revised`); eight lines between Nina and Oren, with directions | "Digli la verità" to S005, effects `ha_detto_la_verita` set true, `fiducia_oren` add 2; "Mentigli" to S005, effect `fiducia_oren` subtract 1 |
| | | S005 La porta della torre (puzzle, `draft`) | "Apri la porta" (condition, all: `fiducia_oren` ≥ 2, `ha_la_chiave` is true) to S006; "Tieni la chiave" to S007 |
| | I finali | S006 La porta si apre (cutscene, `draft`), ending "Finale della fiducia" | |
| | | S007 La chiave perduta (cutscene, `draft`), ending "Finale della solitudine" | |
| | | S008 I tetti (exploration, `draft`), reached by no choice | |

  S004 sits after S002 in manuscript order on purpose, so the explicit choices are visible; S008 is unreachable on purpose, so the first visit to the flow shows a real check.
- **Map**: Anselmo mentore / Nina allieva (`mentorship`); Nina and Mira (`friendship`); Oren and Anselmo (`enmity`); memberships of the two factions.
- **Resulting path**: stages 1 to 5 done, stage 6 current ("1 scena irraggiungibile").

---

## Appendix D. Export formats

Every export reads the active revisions of non-trashed scenes, in manuscript order, and respects the modules that are on. File names: the title as a slug plus the date (`linverno-di-capo-nero-2026-10-18.docx`). Mentions become plain text. Each format has an acceptance test; an export is not done until its test passes.

### D.1 Manuscript, DOCX and PDF
- **Title page** (option, on): title, subtitle, author name, and the word count rounded to the hundred ("circa 38.400 parole").
- **Headings**: part titles and chapter titles start a new page (options, on); scene titles optional (off for novels, on for games). DOCX uses real styles (Title, Heading 1 for parts, Heading 2 for chapters, Heading 3 for scenes, Normal) so an editor can restyle the whole file.
- **Scene separator**: "***" centred (default), "#", or a blank line.
- **Layouts**: "Cartella editoriale", A4, Courier New 12 pt, 60 characters per line and 30 lines per page (the Italian standard page of 1.800 characters), page numbers; "Libro", the app's manuscript serif, 11 pt, justified, first-line indent, no indent after headings and separators, A5 for PDF.
- **Dialogue lines** (`script`): the speaker in small capitals, the direction in parentheses, then the line.
- Bold, italic, underline, quotes and alignment are kept.
- Test: the DOCX opens in Word and LibreOffice with the navigation pane showing parts and chapters; the PDF of a 50-scene project is produced in under a minute.

### D.2 Manuscript, EPUB 3
Metadata (title, author, language from the project); a table of contents from parts and chapters; one XHTML file per chapter; separators; italic and bold kept. P1: a cover image. Test: passes epubcheck with no errors.

### D.3 Manuscript, TXT
UTF-8; part and chapter titles on their own lines followed by a blank line; paragraphs separated by a blank line; separators as "***"; formatting dropped. Test: opens correctly in a plain text editor on Windows and macOS.

### D.4 Project document, DOCX (P1 also PDF)
- Novel, "Bibbia della storia": premise, fabula, setting; strands; characters (main ones with each answered section as question and answer, or as free text; traits; relationships; primary image); groups; locations; objects; codex (when on); events in date order; structure (parts and chapters with their purpose, scenes with status and synopsis).
- Game, "Documento di narrative design": all of the above, plus scene codes, kinds, start and endings; quests with giver, objectives and rewards; the variables table; the branch table (scene code, choice text, target code, condition and effects as sentences); the flow check summary; for every character, the `voice` section and the number of lines and words spoken.
- Test: opens in Word and LibreOffice; every section has a heading in the navigation pane.

### D.5 JSON for developers
A documented public format (`dramatis-game`, version 1; engineering publishes its schema beside the exporter), separate from the backup: project metadata; variables; characters (id, name, aliases, importance, playable, one-line description, voice answers); locations; objects; groups; quests with objectives and rewards; scenes in manuscript order (code, title, act, chapter, kind, status, start, ending and label, synopsis, plain text, dialogue lines with id, speaker id or label, direction and text, choices with text, target code, condition and effects). Implicit continuations are written out as choices with `"implicit": true`, so a consumer needs no knowledge of the rule. Test: validates against the published schema.

### D.6 Twee 3, Harlowe 3 (P1 SugarCube 2)
- `StoryTitle`; `StoryData` with the project's IFID, format "Harlowe", format version 3.3, and the start passage.
- One passage per scene, named `S003 Dialogo con Oren`, tagged with its kind (and `ending` for endings); the text as paragraphs; dialogue lines as `''Oren'' (sottovoce): testo`.
- A choice with no condition and no effect is `[[Dille la verità->S005 La porta della torre]]`; with effects it is `(link: "Dille la verità")[(set: $ha_detto_la_verita to true)(set: $fiducia_oren to it + 2)(go-to: "S005 La porta della torre")]`; a condition wraps it in `(if: $fiducia_oren >= 2 and $ha_la_chiave is true)[...]`. An implicit continuation is `[[Continua->...]]` in the UI language.
- A `startup`-tagged passage sets every variable to its default.
- Test: the file imports into Twine 2.6 or later and compiles with Tweego without errors, and the demo game plays from start to both endings.

### D.7 Ink
- `VAR` declarations with defaults at the top, then a divert to the start knot.
- One knot per scene, named from the code and an ASCII slug of the title (`s003_dialogo_con_oren`).
- Dialogue lines as `Oren: (sottovoce) testo #id:S003-L004`.
- Choices are sticky (`+`) so that hub scenes keep working, with the condition in braces and the effects inside: `+ {fiducia_oren >= 2 and ha_la_chiave} [Apri la porta] ~ ha_detto_la_verita = true -> s006_la_porta_si_apre`. Number effects use `+=` and `-=`; a boolean toggle is `~ x = not x`.
- An implicit continuation is a divert to the next knot; an ending ends with `-> END`.
- Test: compiles with inklecate without errors or warnings about missing knots, and the demo game plays to both endings in Inky.

### D.8 Voice-over script, CSV
- One row per dialogue line, in manuscript order: `line_id`, `scene_code`, `act`, `chapter`, `scene_title`, `scene_kind`, `order`, `speaker`, `speaker_id`, `direction`, `text`, `words`, `scene_status`.
- UTF-8 with BOM, RFC 4180 quoting; delimiter comma (default) or semicolon (for spreadsheets set to Italian); filters by act, chapter and speaker; option to include only scenes `revised` or `final`.
- Test: opens with correct accents in Excel and Google Sheets with either delimiter; the same project exported twice produces the same line ids.

### D.9 Project backup
As in 7.25, named `titolo-backup-2026-10-18.dramatis.zip`. Test: the round trip of 7.25 on both demo projects.
