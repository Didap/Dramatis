# Product

## Register

product

Dramatis is primarily a product: the writing workspace (project shell, characters, world, manuscript, editor) is where users live. The public landing at `/` and the sign-in pages operate in the brand register; treat those as a per-task override, not the default.

## Users

Three populations share the same app. The design does not split into separate products; the guidance adapts and steps aside, and the structure adapts to the medium (novel or video game).

**The first-time novelist.** Has carried an idea for years, a few scenes in a notes app, no method. Opens Dramatis on a laptop on a Sunday morning, or on the phone on the train home. Needs the right questions at the right moment (who is your protagonist, what do they want, what stands in the way), a visible sense of where they are in the journey, and never an intimidating blank screen. The risk is abandonment after the first week because the tool felt like homework.

**The experienced author.** Has a method: outlines, a character bible, years of Scrivener or bibisco. Writes most days, 1,000 to 3,000 words a session, revises heavily, juggles thirty characters, several plot strands and a timeline that must not contradict itself. Needs speed (keyboard-first navigation, dense views while planning, a silent editor while writing) and certainty that nothing is ever lost. The risk is friction from guidance they don't need.

**The game writer.** A narrative designer, or an indie developer who is also the writer, building the story of a video game. Keeps the lore bible (characters, factions, places, items, history), shapes the structure the game will follow (acts, chapters, main and side quests), writes cutscenes and dialogue in script form, and designs the branches: player choices, the conditions that open or close a path, the endings. Works next to game designers, developers and a voice director, so what they write has to leave Dramatis in a shape the team can use. The risk is a tool that only thinks in linear chapters.

The job is the same for all three: carry a story from its first premise to a finished work (a manuscript ready for an editor or a publisher, or a game script and story bible ready for the team), keeping the story's world coherent along the way (characters and their relationships, groups and factions, places, objects, plot strands and quests, chronology).

Context of use: desktop or laptop for long writing and planning sessions; phone for capturing an idea, checking a character's eye colour in the middle of a scene, writing a scene on the go, reading back the last chapter. Sessions last from five minutes (a note) to four hours (deep writing).

## Product Purpose

Dramatis is a web app for writing novels and the stories of video games. It follows bibisco's method (architecture, characters, world, chapters and scenes, analysis, export) rebuilt as a modern, responsive workspace whose data lives in the author's account and follows them from desk to phone.

It holds the story's bible (premise, fabula, setting, narrative strands, characters with interview-style profiles and categories, groups, locations, objects, relationships, timeline) and the work itself (parts, chapters, scenes with revisions), and it connects them: scenes are tagged with their point of view, characters, places, objects, strands and story time; characters are mentioned directly in the text; analysis shows how all of it is distributed across the work.

Every project has a type, novel or video game, chosen at creation and changeable later. The bible is shared by both; the structure, the vocabulary and the exports follow the medium. A game project adds what a linear book does not need: branches between scenes (player choices, with conditions and effects on game state), a flow view of those branches with starts and endings, main and side quests with objectives, state variables, a lore codex, dialogue written as script lines with a speaker, and exports for the team (structured JSON, Twine and Ink, a voice-over script). A novel can switch the same modules on, for a gamebook or a non-linear story.

Success looks like this: a first-time novelist finishes a complete first draft inside Dramatis and exports a clean manuscript (DOCX, EPUB, PDF); an experienced author moves their bible over from bibisco or Scrivener and stops keeping a parallel spreadsheet of who knows what, and when; a game writer hands the team a story bible and a branching script they can actually build from.

Out of scope: AI writing. The author writes the novel; Dramatis keeps it organised, coherent and safe.

## Brand Personality

Calm, literary, precise.

- **Voice**: a good editor sitting beside you. Quiet, attentive, never pushy. Plain words and the real vocabulary of the craft (premise, fabula, scene, point of view), explained once, where it is first needed.
- **Tone**: warm but understated. Encourages with facts ("1,240 words today") rather than exclamation marks.
- **Emotional goals**: focus while writing, clarity while planning, confidence that the story holds together, the quiet pride of watching the manuscript grow.
- **References**: iA Writer and Ulysses for the writing surface (the text at the centre, typographic care, an interface that disappears while you write); Linear and Things 3 for the clarity and speed of the planning views.

## Anti-references

- **Generic SaaS**: purple gradients, identical card grids, dashboards of big numbers with small labels, hero-metric templates, marketing language inside the app.
- **Old-style desktop writing software** (bibisco, Scrivener): grey panels, tiny icons, modal dialogs for everything, crowded toolbars, tabs inside tabs.
- **AI in the foreground**: "Generate" buttons, sparkles, chat bubbles offering to write for you. Dramatis has no AI writing features.

## Design Principles

1. **The page comes first.** When the author writes, everything else steps back. The editor is the most carefully made surface in the app, and the chrome recedes around it.
2. **Guide, then step aside.** Questions, explanations and the path from premise to export are visible to those who are starting, and collapse or disappear for those who know. An expert is never held behind a wizard.
3. **One story, everything connected.** A character exists once; scenes, relationships, the timeline and the analysis all point to it. Tagging is a by-product of writing (mentions, scene details), not a chore.
4. **Never lose a word.** Autosave with a visible state, revisions, a trash that restores, export and backup always one step away. Trust is the product.
5. **The same tool on every screen.** The phone is a first-class surface for capturing, checking and writing. The layout adapts structurally; the features do not shrink.
6. **One craft, two media.** Novels and games share the bible and the writing surface. What changes with the medium (structure, vocabulary, branches, exports) changes quietly, without turning the app into two products or burying the novelist under game tooling.

## Accessibility & Inclusion

- **WCAG 2.2 AA**: text contrast at least 4.5:1 (3:1 for large text and UI components), always-visible focus, full keyboard operation including keyboard alternatives to every drag-and-drop (move up, move down, move to chapter), targets of at least 24×24 CSS px and 44×44 for primary touch actions.
- **Motion and theme**: respect `prefers-reduced-motion`; light, dark and system themes, chosen by the user.
- **Reading and writing comfort**: adjustable editor font size, line height and line width; a choice between serif and sans for the manuscript.
- **Language**: Italian (default) and English. All copy goes through i18n, with no hard-coded strings; dates, numbers and word counts are localised.
- **Colour is never the only signal**: statuses carry a label or an icon, and strand, group and relationship colours always come with a name.
