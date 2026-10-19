#!/usr/bin/env node
// Opens every page of the app (both demo projects, desktop and phone) in one headless Chromium and
// reports the pages with errors. One line per failing page, a summary, exit 1 when any page fails.
//   node scripts/check-pages.mjs [--shots] [--only <substring>] [--mobile-only] [--desktop-only]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const base = (process.env.DRAMATIS_BASE_URL ?? 'http://localhost:3070').replace(/\/$/, '')
const shots = args.includes('--shots')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const viewports = args.includes('--mobile-only') ? ['mobile'] : args.includes('--desktop-only') ? ['desktop'] : ['desktop', 'mobile']

const PUBLIC = ['/', '/login', '/signup']
const PRIVATE = ['/projects', '/account']
const PROJECT = [
  '', '/goals', '/architecture', '/architecture/premise', '/architecture/fabula', '/architecture/setting',
  '/strands', '/strands/:strand', '/notes', '/notes/:note', '/world', '/characters', '/characters/:character',
  '/characters/:character/personal', '/groups', '/groups/:group', '/locations', '/locations/:location',
  '/objects', '/objects/:object', '/relations', '/relations/:map', '/codex', '/codex/:codexEntry',
  '/manuscript', '/manuscript/chapters/:chapter', '/manuscript/scenes/:scene', '/flow', '/variables',
  '/timeline', '/analysis', '/search?q=mare', '/trash', '/settings', '/export',
]
const COLLECTION = { strand: 'strands', note: 'notes', character: 'characters', group: 'groups', location: 'locations', object: 'objects', map: 'maps', codexEntry: 'codexEntries', chapter: 'chapters', scene: 'scenes' }

const browser = await chromium.launch()
const failures = []
let count = 0

async function check(context, path, viewport) {
  if (only && !path.includes(only)) return
  count++
  const page = await context.newPage()
  const problems = []
  page.on('console', msg => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`) })
  page.on('pageerror', error => problems.push(`uncaught: ${error.message}`))
  page.on('response', (response) => {
    const url = response.url()
    if (response.status() >= 400 && url.startsWith(base) && !url.includes('/__nuxt')) problems.push(`http ${response.status()} ${response.request().method()} ${url.slice(base.length)}`)
  })
  try {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 45_000 })
    if ((response?.status() ?? 0) >= 400) problems.push(`status ${response.status()}`)
    await page.waitForTimeout(500)
    if (shots) {
      mkdirSync('.checks/pages', { recursive: true })
      await page.screenshot({ path: `.checks/pages/${path.replace(/[^a-z0-9]+/gi, '-').slice(0, 90)}-${viewport}.png` })
    }
  }
  catch (error) {
    problems.push(`navigation: ${error.message.split('\n')[0]}`)
  }
  await page.close()
  if (problems.length) failures.push({ path, viewport, problems: [...new Set(problems)] })
}

try {
  for (const viewport of viewports) {
    const options = viewport === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } }

    const guest = await browser.newContext({ ...options, locale: 'it-IT' })
    for (const path of PUBLIC) await check(guest, path, viewport)
    await guest.close()

    const context = await browser.newContext({ ...options, locale: 'it-IT' })
    const login = await context.request.post(`${base}/api/auth/login`, { data: { email: 'demo@dramatis.local', password: 'dramatis-demo' } })
    if (!login.ok()) throw new Error('demo login failed: run node scripts/dev-seed.mjs')
    for (const path of PRIVATE) await check(context, path, viewport)

    const projects = (await (await context.request.get(`${base}/api/projects`)).json()).filter(p => !p.deletedAt)
    for (const project of projects) {
      const bundle = await (await context.request.get(`${base}/api/projects/${project.id}`)).json()
      for (const route of PROJECT) {
        const match = route.match(/:(\w+)/)
        let path = route
        if (match) {
          const item = bundle[COLLECTION[match[1]]]?.[0]
          if (!item) continue
          path = route.replace(`:${match[1]}`, item.id)
        }
        await check(context, `/p/${project.id}${path}`, viewport)
      }
      await check(context, `/print/${project.id}`, viewport)
    }
    await context.close()
  }
}
catch (error) {
  failures.push({ path: '(setup)', viewport: '', problems: [error.message] })
}
finally {
  await browser.close()
}

for (const f of failures) console.log(`✗ ${f.viewport} ${f.path}: ${f.problems.slice(0, 2).join(' | ').slice(0, 300)}`)
console.log(`check-pages: ${count} pages, ${failures.length} with errors`)
process.exit(failures.length ? 1 : 0)
