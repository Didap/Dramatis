#!/usr/bin/env node
// Checks the Verified Rule of DESIGN.md against app/assets/css/main.css: every text role at 4.5:1 on
// bg, bg-muted, bg-elevated and bg-floating in both themes; border-accented and entity colours at 3:1;
// initials (ink) at 4.5:1 on their tint; inverted text on the primary and its hover. Exit 1 on failure.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const block = (selector) => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  return css.slice(start, css.indexOf('\n}', start))
}
const vars = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(m => [m[1], m[2]]))
const light = vars(block(':root'))
const dark = { ...light, ...vars(block('.dark')) }

const dec = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => dec(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

let checked = 0
const failures = []
const need = (theme, label, fg, bg, min) => {
  checked++
  const r = ratio(fg, bg)
  if (r < min) failures.push(`${theme}: ${label} ${r.toFixed(2)} < ${min}`)
}
const ENTITIES = ['brick', 'amber', 'ochre', 'olive', 'green', 'teal', 'blue', 'indigo', 'plum', 'slate']
for (const [theme, v] of [['light', light], ['dark', dark]]) {
  const surfaces = ['ui-bg', 'ui-bg-muted', 'ui-bg-elevated', 'ui-bg-floating']
  for (const s of surfaces) {
    for (const role of ['ui-text-dimmed', 'ui-text-muted', 'ui-text-toned', 'ui-text', 'ui-text-highlighted', 'ui-primary', 'ui-success', 'ui-warning', 'ui-error', 'ui-info']) {
      need(theme, `${role} on ${s}`, v[role], v[s], 4.5)
    }
    need(theme, `ui-border-accented on ${s}`, v['ui-border-accented'], v[s], 3)
    for (const e of ENTITIES) need(theme, `entity-${e} on ${s}`, v[`entity-${e}`], v[s], 3)
  }
  need(theme, 'inverted text on primary', v['ui-text-inverted'], v['ui-primary'], 4.5)
  need(theme, 'inverted text on primary hover', v['ui-text-inverted'], v['ui-primary-hover'], 4.5)
  need(theme, 'highlighted text on selection', v['ui-text-highlighted'], v['ui-selection'], 4.5)
  for (const e of ENTITIES) need(theme, `entity-${e} ink on tint`, v[`entity-${e}-ink`], v[`entity-${e}-tint`], 4.5)
}
console.log(`check-contrast: ${checked} pairs, ${failures.length} failures`)
for (const f of failures.slice(0, 20)) console.log(`  ✗ ${f}`)
process.exit(failures.length ? 1 : 0)
