#!/usr/bin/env node
// Parts (acts) off and on with chapters in the trash (spec 7.15), end to end against the dev server.
// Creates a throwaway account and novel, runs the cycle, restores trashed chapters and checks where
// they land (never in a "Ripristinati" part while parts are off, back in their own part when parts
// return), then deletes the account. Prints a few lines and exits 1 when a check fails.
//
//   node scripts/check-manuscript-parts.mjs [--base http://localhost:3070]

const args = process.argv.slice(2)
const at = args.indexOf('--base')
const base = (at >= 0 ? args[at + 1] : process.env.DRAMATIS_BASE_URL ?? 'http://localhost:3070').replace(/\/$/, '')

let cookie = ''
async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ')
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 160)}`)
  return text ? JSON.parse(text) : null
}

const failures = []
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? ` (${detail})` : ''}`)
}

const email = `parts-check-${Date.now()}@dramatis.local`
let registered = false
try {
  await call('POST', '/api/auth/register', { name: 'Parts check', email, password: 'parts-check-2026', locale: 'it' })
  registered = true
  const project = await call('POST', '/api/projects', { title: 'Parts check', kind: 'novel' })
  const P = `/api/projects/${project.id}`
  const bundle = () => call('GET', P)
  const parts = on => call('POST', `${P}/manuscript/parts`, { enabled: on })
  const restore = (collection, id) => call('POST', `${P}/trash/restore`, { collection, id })
  const live = async (id) => (await bundle()).chapters.find(c => c.id === id)

  // Parts on: three chapters in "Parte prima", the last moved to a second part.
  const [c1, c2, c3] = [await call('POST', `${P}/chapters`, { title: 'Uno' }), await call('POST', `${P}/chapters`, { title: 'Due' }), await call('POST', `${P}/chapters`, { title: 'Tre' })]
  await parts(true)
  const first = (await bundle()).parts[0]
  const second = await call('POST', `${P}/parts`, { title: 'Parte seconda', position: 1 })
  await call('POST', `${P}/reorder`, { collection: 'chapters', ids: [c3.id], partId: second.id })

  // (a) A chapter trashed while parts are on, restored while they are off: no part comes back.
  await call('DELETE', `${P}/chapters/${c2.id}`)
  await parts(false)
  await restore('chapters', c2.id)
  let now = await bundle()
  check('parts off: no live part after restoring a chapter', now.parts.length === 0, now.parts.map(p => p.title).join(', '))
  check('parts off: the restored chapter has no part', (await live(c2.id))?.partId === null)
  const order = [...now.chapters].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)).map(c => c.title).join(',')
  check('parts off: reading order kept', order === 'Uno,Due,Tre', order)

  // (b) A chapter trashed while parts are off, restored after they are back: in its own part.
  await call('DELETE', `${P}/chapters/${c2.id}`)
  await parts(true)
  await restore('chapters', c2.id)
  now = await bundle()
  check('parts on: the parts come back', now.parts.map(p => p.id).sort().join() === [first.id, second.id].sort().join(), now.parts.map(p => p.title).join(', '))
  check('parts on: the restored chapter is back in its part', (await live(c2.id))?.partId === first.id, (await live(c2.id))?.partId ?? 'null')
  check('parts on: the other chapters are back in theirs', (await live(c1.id))?.partId === first.id && (await live(c3.id))?.partId === second.id)
  check('parts on: no "Ripristinati" part', !now.parts.some(p => /ripristinati|restored/i.test(p.title)))

  // (c) A part trashed with its chapter: the cycle leaves them together, restoring the part brings both.
  const third = await call('POST', `${P}/parts`, { title: 'Parte terza', position: 2 })
  const c4 = await call('POST', `${P}/chapters`, { title: 'Quattro', partId: third.id })
  await call('DELETE', `${P}/parts/${third.id}`)
  await parts(false)
  await parts(true)
  await restore('parts', third.id)
  check('a part restored after the cycle brings its chapter', (await live(c4.id))?.partId === third.id, (await live(c4.id))?.partId ?? 'gone')

  console.log(`check-manuscript-parts: ${failures.length ? `${failures.length} failed` : 'ok'} (off/on cycles with chapters in the trash)`)
  for (const failure of failures) console.log(`  ✗ ${failure}`)
}
catch (error) {
  failures.push(error.message)
  console.log(`check-manuscript-parts: failed: ${error.message}`)
}
finally {
  if (registered) await call('DELETE', '/api/account', { email }).catch(error => console.log(`  ! account not deleted: ${error.message}`))
}
process.exit(failures.length ? 1 : 0)
