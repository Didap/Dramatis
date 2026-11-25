// ⌘F works in focus mode and finds tagged names: in a scene of the demo novel that has a tag, focus
// mode on, ⌘F opens the find margin with the focus in its field, the strip at the top leaves the margin
// free, typing a tag's name highlights the tag, and Esc closes find while focus mode stays.
// Signs in as the demo account (node scripts/dev-seed.mjs) and uses its oldest novel. Writes nothing.
//
//   node scripts/check-find.mjs [--base http://localhost:3070]
//
// Prints one line per case and PASS or FAIL; exits 1 on failure.
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : (process.env.DRAMATIS_BASE_URL ?? 'http://localhost:3070')

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

// The first scene with a tag in its text (the bundle counts them), and the tag's name.
const mentionsIn = (node, out = []) => {
  if (node?.type === 'mention' && node.attrs?.label) out.push(node.attrs.label)
  for (const child of node?.content ?? []) mentionsIn(child, out)
  return out
}
const bundle = await (await context.request.get(`${base}/api/projects/${novel.id}`)).json()
const scene = bundle.scenes.find(s => !s.deletedAt && Object.values(s.tags ?? {}).some(tag => tag.mentions > 0))
const content = scene && await (await context.request.get(`${base}/api/projects/${novel.id}/scenes/${scene.id}/content`)).json()
const name = content && mentionsIn(content.content)[0]
if (!name) {
  console.log('FAIL no scene with a tag in the demo novel')
  process.exit(1)
}

const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
await page.goto(`${base}/p/${novel.id}/manuscript/scenes/${scene.id}`)
// The text is in once its tags are.
await page.waitForSelector('.ProseMirror .mention', { timeout: 10000 })
await page.locator('.ProseMirror').first().click()

const appears = selector => page.locator(selector).first().waitFor({ timeout: 3000 }).then(() => true, () => false)
const goes = selector => page.locator(selector).waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false)
const present = async selector => await page.locator(selector).count() > 0

let ok = true
const check = (label, pass, detail = '') => {
  console.log(`${pass ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`)
  ok = ok && pass
  return pass
}
const finish = async () => {
  console.log(ok && !errors.length ? 'PASS' : 'FAIL', errors.slice(0, 5).join(' | '))
  await browser.close()
  process.exit(ok && !errors.length ? 0 : 1)
}

await page.keyboard.press('ControlOrMeta+Shift+Enter')
check('focus mode on', await appears('.d-scene.is-focus'))

await page.keyboard.press('ControlOrMeta+f')
check('⌘F opens the find margin in focus mode', await appears('aside.d-inspector .d-find'))
// Typing anywhere else would change the demo text: stop here.
if (!check('the focus is in the find field', await page.evaluate(() => !!document.activeElement?.closest('.d-find')))) await finish()
const overlap = await page.evaluate(() => {
  const strip = document.querySelector('.d-focus-strip')?.getBoundingClientRect()
  const aside = document.querySelector('aside.d-inspector')?.getBoundingClientRect()
  return strip && aside ? Math.round(strip.right - aside.left) : null
})
check('the strip leaves the margin free', overlap !== null && overlap <= 0, `overlap ${overlap}px`)

await page.keyboard.type(name)
check(`a tag is found by its name ("${name}")`, await appears('.ProseMirror .mention.d-find-match'))

// Nothing should happen here, so there is nothing to wait for: a short pause.
await page.keyboard.press('Alt+Enter')
await page.waitForTimeout(400)
check('Alt+Enter leaves find open in focus mode', await present('aside.d-inspector .d-find'))

await page.keyboard.press('Escape')
check('Esc closes find', await goes('aside.d-inspector'))
check('focus mode stays', await present('.d-scene.is-focus'))

await page.keyboard.press('ControlOrMeta+f')
await appears('aside.d-inspector button')
await page.locator('aside.d-inspector button').first().focus()
await page.keyboard.press('Escape')
check('Esc from the margin\'s close button closes find, not focus mode', await goes('aside.d-inspector') && await present('.d-scene.is-focus'))

await finish()
