#!/usr/bin/env node
// Makes sure the demo account exists with one demo novel and one demo game.
// Prints a few lines and exits 0 or 1.   node scripts/dev-seed.mjs [--locale it|en] [--fresh]
const base = (process.env.DRAMATIS_BASE_URL ?? 'http://localhost:3070').replace(/\/$/, '')
const email = process.env.DRAMATIS_CHECK_EMAIL ?? 'demo@dramatis.local'
const password = process.env.DRAMATIS_CHECK_PASSWORD ?? 'dramatis-demo'
const args = process.argv.slice(2)
const locale = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : 'it'
const fresh = args.includes('--fresh')
let cookie = ''

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    if (pair.startsWith('dramatis-session=')) cookie = pair
  }
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

try {
  let res = await api('POST', '/api/auth/login', { email, password })
  if (res.status === 401) res = await api('POST', '/api/auth/register', { name: 'Demo', email, password, locale })
  if (res.status !== 200) throw new Error(`cannot sign in (${res.status})`)
  let projects = (await api('GET', '/api/projects')).data
  if (fresh) {
    for (const p of projects) {
      if (!p.deletedAt) await api('DELETE', `/api/projects/${p.id}`)
      await api('DELETE', `/api/projects/${p.id}?forever=1`)
    }
    projects = []
  }
  projects = projects.filter(p => !p.deletedAt)
  for (const kind of ['novel', 'game']) {
    if (projects.some(p => p.kind === kind)) {
      console.log(`dev-seed: ${kind} already there`)
      continue
    }
    const created = await api('POST', '/api/projects/demo', { kind, locale })
    if (created.status !== 200) throw new Error(`demo ${kind} failed (${created.status}) ${JSON.stringify(created.data).slice(0, 200)}`)
    console.log(`dev-seed: created ${kind} "${created.data.title}" ${created.data.id}`)
  }
  console.log(`dev-seed: ok (${email} / ${password})`)
}
catch (error) {
  console.log(`dev-seed: failed: ${error.message}`)
  process.exit(1)
}
