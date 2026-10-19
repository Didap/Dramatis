// ⌘K opens exactly one search palette, with the focus in it, from the page body, from a text field
// and from the scene editor; keys typed after the shortcut land in the palette, not in the field.
// Signs in as the demo account (node scripts/dev-seed.mjs) and uses its oldest novel.
//
//   node scripts/check-shortcuts.mjs [--base http://localhost:3070]
//
// Prints one line per case and PASS or FAIL; exits 1 on failure.
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:3070'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'it-IT' })
await context.addCookies([{ name: 'dramatis_locale', value: 'it', url: base }])
const login = await context.request.post(`${base}/api/auth/login`, { data: { email: 'demo@dramatis.local', password: 'dramatis-demo' } })
if (!login.ok()) {
  console.log(`FAIL login ${login.status()} (run node scripts/dev-seed.mjs)`)
  process.exit(1)
}
const projects = await (await context.request.get(`${base}/api/projects`)).json()
const novel = projects.filter(p => p.kind === 'novel' && !p.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
if (!novel) {
  console.log('FAIL no novel in the demo account')
  process.exit(1)
}

const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
const settle = () => page.waitForLoadState('networkidle').catch(() => {})
const dialogs = () => page.locator('[role="dialog"]').count()

async function attempt(label, prepare) {
  await prepare()
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(400)
  const n = await dialogs()
  const focusInPalette = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  console.log(`${label}: dialogs=${n} focusInPalette=${focusInPalette}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  return n === 1 && focusInPalette
}

let ok = true
await page.goto(`${base}/p/${novel.id}`)
await settle()
ok = await attempt('body', async () => { await page.evaluate(() => document.activeElement?.blur?.()) }) && ok

await page.goto(`${base}/p/${novel.id}/settings`)
await settle()
const field = page.locator('#settings-subtitle')
const before = await field.inputValue()
ok = await attempt('input', async () => { await field.click() }) && ok
await field.click()
await page.keyboard.press('Meta+k')
await page.waitForTimeout(400)
await page.keyboard.type('zzq')
await page.waitForTimeout(300)
const typed = await page.locator('[role="dialog"] input').first().inputValue().catch(() => '')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const after = await field.inputValue()
console.log(`typed into palette=${typed === 'zzq'} field unchanged=${before === after}`)
ok = ok && typed === 'zzq' && before === after

const bundle = await (await context.request.get(`${base}/api/projects/${novel.id}`)).json()
const scene = bundle.scenes.find(s => s.wordCount > 0) ?? bundle.scenes[0]
await page.goto(`${base}/p/${novel.id}/manuscript/scenes/${scene.id}`)
await settle()
await page.waitForSelector('.ProseMirror', { timeout: 10000 })
ok = await attempt('editor', async () => { await page.locator('.ProseMirror').first().click() }) && ok

console.log(ok && !errors.length ? 'PASS' : 'FAIL', errors.slice(0, 5).join(' | '))
await browser.close()
process.exit(ok && !errors.length ? 0 : 1)
