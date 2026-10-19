# Demo project format

`server/content/demo/{novel,game}.{it,en}.json` are imported by `server/utils/demo.ts`
(`POST /api/projects/demo { kind, locale }`, or `node scripts/dev-seed.mjs`).

Keys are snake_case ids unique within their kind. References use `"<type>:<key>"` where type is
`character`, `location`, `object` or `group` (a bare key means a character).

```jsonc
{
  "kind": "novel" | "game",
  "title": "", "subtitle": "", "authorName": "", "genre": "", "logline": "",
  "premise": ["paragraph"], "fabula": ["paragraph"], "setting": ["paragraph"],
  "wordGoal": 80000, "dailyWordGoal": 800,
  "characters": [{ "key", "name", "aliases": [], "importance": "main|secondary|minor", "role": "<CHARACTER_ROLES key>",
                   "tagline": "", "description": ["paragraph"], "profile": { "<section key>": "free text" } }],
  "groups": [{ "key", "name", "kind": "<GROUP_KINDS key>", "description": [], "members": ["character:<key>", "location:<key>"] }],
  "locations": [{ "key", "name", "kind": "", "nation": "", "region": "", "city": "", "parent": "<location key>", "description": [] }],
  "objects": [{ "key", "name", "kind": "", "description": [] }],
  "strands": [{ "key", "name", "kind": "<STRAND_KINDS key>", "description": [],
                "quest": { "giver": "<character key>", "objectives": [""], "rewards": "" } }],
  "relations": [{ "from": "character:<key>", "to": "character:<key>", "kind": "<RELATION_KINDS key>", "label": "", "description": "", "directed": false }],
  "parts": [{ "title": "", "chapters": [{ "key", "title", "reason": "", "scenes": [{
      "key", "title", "synopsis": "", "status": "<SCENE_STATUSES key>", "kind": "<SCENE_KINDS key>", "flow": "start|ending",
      "pov": "<POINTS_OF_VIEW key>", "povCharacter": "<character key>", "characters": [], "locations": [], "objects": [], "strands": [],
      "storyAt": "YYYY-MM-DDTHH:mm", "storyTimeLabel": "", "durationMinutes": 30,
      "text": [{ "p": "paragraph with @[character:anna] mentions" }, { "line": { "speaker": "<character key>", "text": "", "direction": "" } }]
  }] }] }],
  "links": [{ "from": "<scene key>", "to": "<scene key>", "label": "choice text", "condition": "trust >= 2", "effect": "trust += 1" }],
  "variables": [{ "name": "snake_case", "type": "boolean|number|string", "default": "", "description": "" }],
  "events": [{ "title", "at": "YYYY-MM-DD", "timeLabel": "", "kind": "story|world|historical", "description": "", "links": ["character:<key>"] }],
  "notes": [{ "title", "category": "", "content": ["paragraph"] }]
}
```

The importer turns `@[type:key]` into mention nodes, `line` blocks into `dialogueLine` nodes, adds mentioned and
speaking characters to the scene's characters, computes word counts, creates one revision per scene, a default mind
map and a plausible writing history for the last weeks.
