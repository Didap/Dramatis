---
name: Dramatis
description: Il Libretto. A writing workspace for novels and video game stories, set like an opera libretto printed by Casa Ricordi.
colors:
  paper: "#f9fcfc"
  grafite-50: "#f2f5f6"
  grafite-100: "#eaeff0"
  grafite-200: "#d4dadc"
  grafite-300: "#bdc4c5"
  grafite-400: "#8a9294"
  grafite-500: "#6d7576"
  grafite-600: "#606869"
  grafite-700: "#3e4547"
  grafite-800: "#212829"
  grafite-900: "#151b1d"
  grafite-950: "#0e1314"
  petrolio-50: "#edf7fb"
  petrolio-100: "#daf0f6"
  petrolio-200: "#b9e1ed"
  petrolio-300: "#88c6d8"
  petrolio-400: "#5eabc0"
  petrolio-500: "#37899f"
  petrolio-600: "#216b7d"
  petrolio-700: "#135666"
  petrolio-800: "#0c4350"
  petrolio-900: "#07313b"
  petrolio-950: "#031e26"
  success: "#2d7546"
  warning: "#935a0f"
  error: "#b63731"
  info: "#2d6bab"
  entity-brick: "#b65446"
  entity-amber: "#c2722c"
  entity-ochre: "#926b00"
  entity-olive: "#8a8e1a"
  entity-green: "#408031"
  entity-teal: "#1e8068"
  entity-blue: "#3389cc"
  entity-indigo: "#5a6cbf"
  entity-plum: "#a15698"
  entity-slate: "#6d7576"
typography:
  display:
    fontFamily: Literata
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.15
  title:
    fontFamily: Schibsted Grotesk
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
  heading:
    fontFamily: Schibsted Grotesk
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: Schibsted Grotesk
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: Schibsted Grotesk
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: Schibsted Grotesk
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.2
  caption:
    fontFamily: Schibsted Grotesk
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.35
  caps:
    fontFamily: Schibsted Grotesk
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.08em
  manuscript:
    fontFamily: Literata
    fontSize: 1.1875rem
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: IBM Plex Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.45
rounded:
  base: 0.1875rem
  portrait: 1.5px
  control: 4.5px
  popover: 6px
  drawer: 9px
spacing:
  unit: 0.25rem
  row: 2.75rem
  row-phone: 3.5rem
  gutter: 1.5rem
  gutter-phone: 1rem
  sidebar: 15.5rem
  rail: 3.5rem
  inspector: 20rem
components:
  button-primary:
    backgroundColor: "{colors.petrolio-600}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: 2rem
  button-primary-hover:
    backgroundColor: "{colors.petrolio-700}"
  input:
    rounded: "{rounded.control}"
    height: 2rem
  chip:
    backgroundColor: "{colors.grafite-100}"
    rounded: "{rounded.control}"
    height: 1.5rem
---

# Design System: Dramatis

## 1. Overview

**Creative North Star: Il Libretto.** The opera libretto as Casa Ricordi printed it in Milan for Verdi and Puccini: a whole drama in a pocket book (who is in it, what happens, every word, how it is performed), read in the dark while the real thing happens on stage. Dramatis takes its rhythm, not its costume. The author's words speak in one face and the house's in another, names are joined to their numbers by a dotted leader, and colour is kept for the story's own information. When the author writes, the house lights go down and only the page stays lit.

It serves novels and games alike: a libretto is literature written to be performed, split into acts and numbered scenes with the cast up front. It is the closest printed ancestor of a game script, and it is still a book.

**Scene of use.** October, the 18:12 regional train from Bologna to Milan: a narrative designer thumbs the lines of a side quest into a phone held in one hand while the low sun strobes through the poplars across the screen. The hardest light Dramatis meets is sun on a phone, and a dark theme loses in glare. Both themes ship; **the default follows the system, and when the system says nothing it is light**, the page closest to the finished manuscript. Dark is *la sala a luci spente*, derived, never inverted: the canvas is a tinted near-black, the sidebar sinks, floating layers rise, text stops short of white, the manuscript loses a little weight to cancel the glow.

**Signature detail: the leader.** On the cast page of a libretto each name runs to its voice along a line of dots. Wherever a name meets its number across a row (cast, contents, analysis, goals), a 1px dotted leader joins them. On the A-to-Z path the leader turns solid as each step is done. One detail, used everywhere it applies and never as ornament.

**Layout philosophy.** Rows, not cards. Groups separated by space, not boxes. One solid control per view. Familiar product patterns (sidebar, command palette, inspector, drawers) with the information architecture of `docs/product-spec.md`, which is the authority on structure; this file is the authority on look.

**Motion energy: responsive.** Feedback and transitions, no choreography. Ease `cubic-bezier(0.16, 1, 0.3, 1)`: 150ms for hover, press and chrome coming back; 200ms for popovers and chips; 250ms for slideovers, drawers and chrome receding. No bounce. With reduced motion on, nothing moves and states change at once.

## 2. Colors

**The Restrained Rule.** Neutrals are graphite tinted toward hue 212 (chroma 0.003 to 0.010, lowest at the ends). One accent, **Petrolio** (hue 218), on under 10% of any screen: the caret and the selection, links (always underlined), focus rings and checked controls, the one solid button of a view, the current step of the path. Every other colour belongs to the story (entities, statuses) or to a state. No gradients, no purple in the chrome.

The paper is cool on purpose: night-shift filters warm every screen after dusk, turning a cream page brown and a barely cool white into paper.

### Primary
- **Petrolio** (#216b7d light, #5eabc0 dark): the hand. Solid hover goes one step deeper (#135666 light, #88c6d8 dark), never a 75% fade.

### Neutral (Grafite)
| Nuxt UI variable | light | dark | role |
|---|---|---|---|
| `--ui-bg` | #f9fcfc | #151b1d | the page |
| `--ui-bg-muted` | #f2f5f6 | #0e1314 | sidebar, inspector (the margin) |
| `--ui-bg-elevated` | #eaeff0 | #212829 | hovered and selected rows |
| `--ui-bg-accented` | #d2dbdd | #3e4547 | pressed, meters |
| `--ui-bg-floating` | #f9fcfc | #1b2123 | popovers, menus, drawers (Dramatis variable) |
| `--ui-text-dimmed` | #666d6f | #8a9294 | placeholders, icons, planned |
| `--ui-text-muted` | #4d5456 | #9fa8aa | secondary text, epithets |
| `--ui-text-toned` | #3e4547 | #bcc4c6 | speakers, draft |
| `--ui-text` | #212829 | #d2dbdd | body |
| `--ui-text-highlighted` | #151b1d | #f2f5f6 | titles, current item |
| `--ui-border` | #d2dbdd | #303738 | hairlines |
| `--ui-border-accented` | #6d7576 | #6d7576 | input outlines, checkboxes (3:1) |

### Semantic
success #2d7546 / #77c88e · warning #935a0f / #ebb466 · error #b63731 / #f07f77 · info #2d6bab / #81b2e9.

### Statuses
A scene gains colour as it matures; the most common state is the quietest. Status is always icon plus label.

| scene status | icon | colour |
|---|---|---|
| planned, Pianificata | `circle-dashed` | dimmed |
| draft, Bozza | `pencil-line` | toned |
| revised, Rivista | `check` | info |
| final, Definitiva | `stamp` | success |

Planning statuses in the bible use rings, so they never read as scene states: `circle` Da fare, `circle-dot` In corso, `circle-check-big` Fatto (success).

### Entity palette
Ten named colours (`ENTITY_COLORS`), shared by characters, groups, strands and relationship kinds. Each has a colour (dots, 1px edges, frames), a tint and an ink (initials, chips). CSS: `--entity-<key>`, `--entity-<key>-tint`, `--entity-<key>-ink`.

| key | it / en | light | dark | relation kinds |
|---|---|---|---|---|
| brick | Mattone / Brick | #b65446 | #ea9687 | enmity |
| amber | Ambra / Amber | #c2722c | #bb7b47 | rivalry |
| ochre | Ocra / Ochre | #926b00 | #cba65a | family |
| olive | Oliva / Olive | #8a8e1a | #8a8e3d | ownership |
| green | Verde / Green | #408031 | #84b879 | friendship |
| teal | Verde acqua / Teal | #1e8068 | #57bd9f | professional, place |
| blue | Blu / Blue | #3389cc | #4f8fc4 | alliance |
| indigo | Indaco / Indigo | #5a6cbf | #95a9f0 | mentorship |
| plum | Prugna / Plum | #a15698 | #d797cd | romance |
| slate | Ardesia / Slate | #6d7576 | #8a9294 | membership, other |

New entities take the least used colour, in the order brick, teal, olive, plum, amber, blue, green, indigo, ochre, slate (`ENTITY_COLOR_ORDER`), so neighbours differ.

### Named rules
- **The Verified Rule.** Every text role reaches 4.5:1 on `bg`, `bg-muted` and `bg-elevated` in both themes; `border-accented`, the ten entity colours and every 1px edge reach 3:1 on the same surfaces; initials reach 4.5:1 on their tint. `node scripts/check-contrast.mjs` checks all of it from `main.css` and fails the build of a palette change.
- **The Name Rule.** A colour is never the only signal. A dot sits beside its name; an edge carries its kind's name; every graph has a legend that also filters; the colour picker announces each colour by name. Under deuteranopia some pairs collapse, which is why identity lives in the name and, on graphs, in the line style.
- **One colour job per view.** In the relationship map colour belongs to relation kinds and nodes stay ink. In the timeline and analysis it belongs to characters and strands. In the flow graph it belongs to statuses, or to quests on request.

## 3. Typography

**The two-voice rule.** Everything the author wrote is set in the manuscript face: scene text, scene and chapter titles, entity names, descriptions, premise, fabula, notes, interview answers, choice texts, lore. Everything the app says is set in the UI face: navigation, labels, buttons, interview questions, computed numbers, dates, statuses, help. The interview becomes what it is, a conversation between the house and the author. Dense tables (the analysis matrix) may set names in the UI face for scanning speed.

- **UI, the house's voice: Schibsted Grotesk** 400, 500, 600. A compact editorial grotesk with a tall x-height, clear at 12px; tabular figures, case-sensitive forms, slashed zero.
- **Manuscript, the author's voice**, chosen by the author: **Literata** (default; variable, optical sizes, italics; 400 text, 600 names and titles, 700 bold) or **Atkinson Hyperlegible Next** (drawn for low-vision readers; also offered as "Alta leggibilità").
- **Mono: IBM Plex Mono** 400 and 500 for state variables, conditions, effects, line ids and the Twee, Ink and JSON previews; loaded only where used.

### Hierarchy
| role | size | line height | weight | use |
|---|---|---|---|---|
| display | 2.25rem | 1.15 | 600 | project title, entity name on a desktop sheet (manuscript face) |
| title | 1.5rem | 1.25 | 600 | page title (UI face); scene title and phone entity name (manuscript face) |
| heading | 1.125rem | 1.35 | 600 | sections in pages and inspector |
| body | 0.9375rem | 1.55 | 400 | UI text; inputs 1rem below 640px (no iOS zoom) |
| small | 0.8125rem | 1.45 | 400 | metadata, help, chips |
| label | 0.875rem | 1.2 | 500 | buttons, navigation, form labels |
| caption | 0.75rem | 1.35 | 500 | counts, timestamps, tab labels |
| caps | 0.75rem | 1.2 | 600, +0.08em | the position line only: PARTE 1 · CAPITOLO 3 · SCENA 2 |

The position line and the speaker labels are the only uppercase in the app. No uppercase eyebrow labels anywhere else.

### The manuscript
- **Size** 1.1875rem desktop, 1.125rem phone; adjustable 14 to 24px. **Line height** 1.6 serif, 1.55 sans (0.05 less on phone); adjustable 1.4 to 2.0.
- **Measure: 70 characters per line** (narrow 60, medium 70, wide 80). CSS `ch` is the width of the zero, 1.26 average Italian characters in Literata, so the measure is `calc(var(--manuscript-measure) * var(--manuscript-avg-char))` with `--manuscript-avg-char` 0.462em for Literata and 0.433em for Atkinson.
- **Paragraphs** indented 1.5em with no space between, as in the printed book, flush after a title or a break.
- **Dialogue in prose** stays prose; the project's punctuation («caporali», “alte”, lineetta) is inserted and closed by the toolbar.
- **Script lines** (*battute*): speaker in the manuscript face, uppercase, 0.8125em, 600, +0.08em, toned; direction in italic, muted, in parentheses; the line in roman; wrapped lines hang 2em, 0.25em between lines. Line ids in Plex Mono caption size, dimmed, in the right margin on wide screens like line numbers in a critical edition; on a phone they are in the line's details. On a very wide window with the inspector closed, the speaker may hang in the left margin with its entity dot.
- **Mentions** are plain text with a 1px dotted underline that turns to the accent on hover. Never a pill.
- **Numerals**: tabular figures for every computed count, formatted by locale (1.240, 1,240); proportional in the manuscript.

## 4. Elevation

Flat by default, with three levels:
- **The page** is flat.
- **In-flow states** (hovered or selected rows) use `bg-elevated`, no shadow.
- **Floating layers** (popovers, menus, drawers, slideovers, toasts) use `--ui-bg-floating` with `--shadow-floating`: in light `0 1px 2px oklch(0.2 0.01 212 / 0.06), 0 8px 24px -4px oklch(0.2 0.01 212 / 0.12)`; in dark a hairline ring and `0 8px 24px -4px oklch(0.1 0.01 212 / 0.5)`, on a surface a step above the page. No blur anywhere.

Radius: `--ui-radius: 0.1875rem`, giving 1.5px portraits, 4.5px buttons, inputs and chips, 6px popovers and graph nodes, 9px drawer tops. Fully round only for dots and the capture button: the corner of a trimmed page, softened just enough not to cut.

Spacing: base 0.25rem. Rows 2.75rem desktop, 3.5rem two-line on phone. 0.375rem label to field, 1rem between fields, 2rem between sections. Gutters 1.5rem desktop, 1rem phone. The editor starts 4rem (desktop) or 1.5rem (phone) from the top. Sidebar 15.5rem (3.5rem rail when collapsed); inspector 20rem.

## 5. Components

**Desktop shell.** `UDashboardSidebar` on `bg-muted`, resizable and collapsible to a rail. Top: project switcher (title in the manuscript face, type in caption size), then search (⌘K opens the command palette). The groups of `docs/product-spec.md` 1.3 with headings in small size, weight 500, muted: Panoramica and Obiettivi; **Storia**; **Mondo**; **Scrittura**; **Revisione**; footer with Cestino, Impostazioni and the account menu. Game modules join their natural group, never a separate "game" section; a hidden module removes its entry. The active item: highlighted text on `bg-elevated`, icon in the accent, weight 500. No side stripe.

**Phone shell** (below 1024px). The bottom bar of the spec 1.4, 3.5rem plus the safe area, labels always visible, 44px targets: Panoramica, Manoscritto (Copione), the centre **Aggiungi** (the screen's one solid control, round, opening the capture drawer with a quick note already focused), Mondo (opens on Personaggi, the other kinds listed below with counts), Altro. The bar gives way to the keyboard toolbar while writing; menus become drawers.

**Page header.** A 3.5rem bar with breadcrumb, save state and actions; the title lives in the content and joins the bar only when scrolled away. Under the title, at most one line for newcomers, dismissible for good (guidance).

**Rows, not cards.** Every collection is a list. A row: portrait or colour dot; the name in the manuscript face 600; the epithet (one-line description) after a comma, manuscript italic, muted; the leader; tabular numbers; the planning icon. Below 40rem the numbers move under the name. Cards only for unequal visual content: the overview's single "Riprendi" block and image contact sheets.

**The leader** (`.leader`). An `aria-hidden` flex child (`flex: 1; min-width: 2rem`), dots drawn with a radial gradient at a 4px pitch on the baseline, `--ui-border-accented` at reduced opacity at rest and full on hover and focus; `.leader--done` is a solid accent rule. Never typed periods.

**Portrait** (`DEntityAvatar`). Characters are a 3:4 rectangle, like a programme headshot: 1.5×2rem in rows, 4.5×6rem on phone sheets, 6×8rem on desktop sheets. Photos get a 1px inset frame in the character's colour; without a photo, the tint with one or two initials in the manuscript face, in the ink. Places, objects and groups: a rounded square with their icon.

**Chips.** Subtle neutral fill, 1.5rem tall, 4.5px radius, a dot or a tiny portrait before the name; removable on hover and focus ("Rimuovi Elena Ferri"). Status chips are icon plus label, no fill.

**Buttons.** One solid primary per view, verb first ("Aggiungi il protagonista"). Secondary buttons are outlined; toolbar buttons are ghost. Deleting moves to the trash with an "Annulla" action. Primary touch targets 44px; icon-only buttons have a tooltip and an `aria-label`.

**Inputs.** Outlined, 1px `border-accented`, 2rem tall (2.75rem on touch), 2px accent focus ring. Label above; help and errors below (`circle-alert` plus words). Long fields (premise, answers, notes) look like the page: manuscript face, growing with the text, a dotted baseline at rest and the full frame on focus.

**Status control.** In the scene inspector the four scene statuses are a segmented control of four glyphs with labels: one tap, states told apart by shape.

**Scene editor.** The page is the canvas: no paper sheet, shadow or texture. The position line in caps, the title and the text all sit at the measure. Chrome is a 3rem top bar (back, focus, details) and a colophon at the foot ("Salvato · 412 parole · oggi 1.240"). From the first keystroke the bar, the colophon and the inspector fade to dimmed ink and lose their hairlines; an error never fades; moving the pointer or pressing Esc brings them back. *Concentrazione* removes sidebar, inspector and bar; options: paragraph focus (other paragraphs in dimmed text, still 4.6:1) and typewriter scrolling. On desktop the details panel is docked on `bg-muted`, like the page's margin, each field with its label above its value, edited in place. On a phone it is a `UDrawer` with snap points; the smallest shows status, point of view and word count. The phone keyboard toolbar: B, I, «», @, Battuta, Scelta. Scene kind icons: `file-text`, `clapperboard`, `messages-square`, `gamepad-2`, `compass`, `swords`, `puzzle`.

**Relationship map** (Vue Flow). No background grid at rest. Nodes are ink and coded by shape: character a 3:4 portrait with the name beneath; location a rounded square with `map-pin`; object a diamond with `gem`; group a pill with `users-round`. Edges 1px (2px hovered or selected), coloured by relation kind, with the family in the dash: bonds (family, romance, friendship) solid; work (alliance, mentorship, professional) long dashes 6 4; conflict (rivalry, enmity) short dashes 3 3; belonging (ownership, place, membership) dotted 1 3; other solid slate. Arrowheads (6px) point at the one the words describe: two different words ("padre", "figlia") draw two lines side by side in opposite directions, each word on its pill halfway towards the end it points at when there is room; the same word for both ("sorella") draws one line with a head at each end; a single word on a mutual relationship names the bond and draws no head. Without words the kind's name sits on a pill at the midpoint and directed kinds point at their target. A selected node gets a 2px accent ring offset 2px, its edges thicken and everything else fades to 30%, like a followspot. Keyboard: Tab through nodes, arrows along edges, Enter opens the slideover; "Collega a..." replaces dragging. On a phone the map is for viewing; the list is the editing route.

**Game flow graph.** Layers from left to right, acts as faint bands labelled in caps. A scene node 13.5rem wide, 1px border, 6px radius: kind icon and title, then status, quest dots, word count. The start scene has an "Inizio" tab with `play` in solid accent, the only solid control on the canvas. Endings show `flag`, "Finale" and a double-rule border. Unreachable scenes: dashed warning border, `unlink`, "Non raggiungibile"; the toolbar counts them. Edges 1px in `border-accented`, dashed when conditional, the implicit continuation dotted; the choice text sits on the edge in manuscript italic; conditions and effects are mono chips ("se fiducia >= 2", "fiducia +1"). A selected node lights every path from Inizio to it in 2px accent.

**Empty states that teach.** What the place is for, one question, one action, one quiet way out; the page shows its shape first with two `aria-hidden` ghost rows with leaders. "Non c'è ancora nessuno in scena. Comincia da chi vuole qualcosa: il protagonista."

**Save state** (`DSaveIndicator`). In the colophon (editor) or the header (elsewhere), at a fixed width so nothing shifts, never a toast. Salvato: `check`, dimmed, tooltip "Salvato alle 10:42". Salvataggio: `loader-circle`, only after 400ms. Senza connessione: `cloud-off`, "salvato su questo dispositivo". Non salvato: `triangle-alert` in the error colour with "Riprova"; after 30 seconds also an inline banner above the page.

**The A-to-Z path.** Under the project title: the steps on one line joined by the leader. Done steps carry `check` and a solid leader; the current step has an accent dot and a highlighted label; the steps ahead are muted and dotted. Each step opens its section, with one fact on hover ("4 principali su 6 hanno un profilo"). On a phone, a vertical list. "Nascondi il percorso" folds it into one line: "Percorso: Stesura, 6 di 8".

**Charts** (analysis, goals). HTML and CSS: rows with the leader and a thin bar, numbers always visible; matrices as tables with counts in the cells. Goals read as a sentence over a thin rule ("Oggi 1.240 parole su 1.500"), never a big-number tile.

## 6. Do's and Don'ts

**Do**
- Set the author's words in the manuscript face and the app's words in the UI face.
- Use the leader only where a name meets a number.
- Give colour one job per view, and put a name beside every colour.
- Keep one solid primary button per view.
- Let the chrome fade while the author types.
- Write empty states the way the editor beside you would talk.
- Derive dark from light, never invert it.
- Check every palette change with `scripts/check-contrast.mjs`, every page at phone width.

**Don't**
- > Generic SaaS: purple gradients, identical card grids, dashboards of big numbers with small labels, hero-metric templates, marketing language inside the app.
- > Old-style desktop writing software (bibisco, Scrivener): grey panels, tiny icons, modal dialogs for everything, crowded toolbars, tabs inside tabs.

  Work inline first, then in a popover, slideover or drawer. Modals only for the command palette, imports, project creation and confirmations that destroy something.
- > AI in the foreground: "Generate" buttons, sparkles, chat bubbles offering to write for you. Dramatis has no AI writing features.

  `sparkles` and `wand-sparkles` are not in the icon set.
- No side-stripe borders, gradient text, glass effects, display faces in labels, buttons or data, em dashes in copy, uppercase outside the position line and speaker labels, theatre props in the chrome (no masks, velvet, gilt, `drama` icon), `#000` or `#fff`.
