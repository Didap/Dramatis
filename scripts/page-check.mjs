#!/usr/bin/env node
// Opens a page of the running dev server in headless Chromium, signed in as the demo account,
// and reports what went wrong. Prints a few lines and exits 1 when the page has errors.
//
//   node scripts/page-check.mjs <path> [options]
//
// <path> may contain tokens resolved against the demo account's projects:
//   {novel} {game}                      project ids (first novel / first game)
//   {novel.character} {game.scene} ...  id of the first item of that collection in the project
//                                       (character, group, location, object, strand, part, chapter, scene, note, event, map)
// Options:
//   --mobile            390x844 viewport, touch (default: desktop 1280x800)
//   --dark              dark colour scheme
//   --locale en         interface language (default it)
//   --shot <file>       screenshot path (default .checks/<slug>-<viewport>.png)
//   --full              full-page screenshot
//   --no-shot           skip the screenshot
//   --wait <ms>         extra wait after load (default 400)
//   --action <a>        repeatable, run in order before the screenshot:
//                       click:<selector>  fill:<selector>=<text>  press:<key>  hover:<selector>
//                       wait:<ms>  waitfor:<selector>  type:<text>  goto:<path>
//   --email/--password  another account (default demo@dramatis.local / dramatis-demo)
//   --base <url>        server (default http://localhost:3070)
//   --quiet-warnings    do not print Vue warnings
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const options = name => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]] : []))

const rawPath = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || ['--mobile', '--dark', '--full', '--no-shot', '--quiet-warnings'].includes(args[i - 1])))
if (!rawPath) {
  console.error('page-check: missing <path>')
  process.exit(2)
}

const base = option('base', process.env.DRAMATIS_BASE_URL ?? 'http://localhost:3070').replace(/\/$/, '')
const email = option('email', process.env.DRAMATIS_CHECK_EMAIL ?? 'demo@dramatis.local')
const password = option('password', process.env.DRAMATIS_CHECK_PASSWORD ?? 'dramatis-demo')
const mobile = flag('mobile')
const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  isMobile: mobile,
  hasTouch: mobile,
  colorScheme: flag('dark') ? 'dark' : 'light',
  locale: option('locale', 'it') === 'en' ? 'en-GB' : 'it-IT',
})
await context.addCookies([{ name: 'dramatis_locale', value: option('locale', 'it'), url: base }])

const problems = []
const warnings = []
let exitCode = 0

try {
  const login = await context.request.post(`${base}/api/auth/login`, { data: { email, password } })
  if (!login.ok()) throw new Error(`login failed (${login.status()}): run "node scripts/dev-seed.mjs" first`)

  // Resolve {novel}, {game.scene}... tokens.
  let path = rawPath
  if (/\{[a-z.]+\}/.test(path)) {
    const projects = await (await context.request.get(`${base}/api/projects`)).json()
    const bundles = {}
    for (const [, kind, collection] of path.matchAll(/\{(novel|game)(?:\.([a-z]+))?\}/g)) {
      // The oldest project of the kind: the demo, not someone's test project.
      const project = projects.filter(p => p.kind === kind && !p.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (!project) throw new Error(`no ${kind} project in the demo account`)
      let id = project.id
      if (collection) {
        bundles[kind] ??= await (await context.request.get(`${base}/api/projects/${project.id}`)).json()
        const plural = { character: 'characters', group: 'groups', location: 'locations', object: 'objects', strand: 'strands', part: 'parts', chapter: 'chapters', scene: 'scenes', note: 'notes', event: 'events', map: 'maps', link: 'links', variable: 'variables', relation: 'relations' }[collection]
        const item = bundles[kind][plural]?.[0]
        if (!item) throw new Error(`no ${collection} in the ${kind} project`)
        id = item.id
      }
      path = path.replace(`{${kind}${collection ? `.${collection}` : ''}}`, id)
    }
  }

  const page = await context.newPage()
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') problems.push(`console: ${text}`)
    else if (msg.type() === 'warning' && /\[Vue warn\]|hydration|\[nuxt\]|\[intlify\]/i.test(text)) warnings.push(text)
  })
  page.on('pageerror', error => problems.push(`uncaught: ${error.message}`))
  page.on('response', (response) => {
    const url = response.url()
    if (response.status() >= 400 && url.startsWith(base) && !url.includes('/__nuxt') && !url.endsWith('favicon.ico')) {
      problems.push(`http ${response.status()}: ${response.request().method()} ${url.slice(base.length)}`)
    }
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.startsWith(base)) problems.push(`request failed: ${request.method()} ${url.slice(base.length)} ${request.failure()?.errorText ?? ''}`)
  })

  const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 45_000 })
  const status = response?.status() ?? 0
  if (status >= 400) problems.push(`page status ${status}`)
  await page.waitForTimeout(Number(option('wait', '400')))

  for (const action of options('action')) {
    const [verb, ...rest] = action.split(':')
    const arg = rest.join(':')
    try {
      if (verb === 'click') await page.locator(arg).first().click({ timeout: 5000 })
      else if (verb === 'hover') await page.locator(arg).first().hover({ timeout: 5000 })
      else if (verb === 'fill') {
        const eq = arg.indexOf('=')
        await page.locator(arg.slice(0, eq)).first().fill(arg.slice(eq + 1), { timeout: 5000 })
      }
      else if (verb === 'type') await page.keyboard.type(arg, { delay: 15 })
      else if (verb === 'press') await page.keyboard.press(arg)
      else if (verb === 'wait') await page.waitForTimeout(Number(arg))
      else if (verb === 'waitfor') await page.locator(arg).first().waitFor({ timeout: 8000 })
      else if (verb === 'goto') await page.goto(`${base}${arg}`, { waitUntil: 'networkidle' })
      else problems.push(`unknown action ${action}`)
      await page.waitForTimeout(250)
    }
    catch (error) {
      problems.push(`action ${action} failed: ${error.message.split('\n')[0]}`)
    }
  }
  await page.waitForLoadState('networkidle').catch(() => {})

  let shot = ''
  if (!flag('no-shot')) {
    const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'root'
    shot = resolve(option('shot', `.checks/${slug}-${mobile ? 'mobile' : 'desktop'}${flag('dark') ? '-dark' : ''}.png`))
    mkdirSync(dirname(shot), { recursive: true })
    await page.screenshot({ path: shot, fullPage: flag('full') })
  }

  const title = await page.title()
  console.log(`page-check: ${path} ${mobile ? 'mobile' : 'desktop'} status=${status} errors=${problems.length} warnings=${warnings.length} title="${title}"${shot ? ` shot=${shot}` : ''}`)
  for (const p of [...new Set(problems)].slice(0, 12)) console.log(`  ✗ ${p.slice(0, 300)}`)
  if (!flag('quiet-warnings')) for (const w of [...new Set(warnings)].slice(0, 6)) console.log(`  ! ${w.slice(0, 300)}`)
  if (problems.length) exitCode = 1
}
catch (error) {
  console.log(`page-check: ${rawPath} failed: ${error.message.split('\n')[0]}`)
  exitCode = 1
}
finally {
  await browser.close()
}
process.exit(exitCode)
