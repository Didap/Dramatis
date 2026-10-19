#!/usr/bin/env node
// Every export of the demo novel and the demo game, checked against appendix D of the spec, and the import
// guards. One line per check, exit 1 when any fails. Needs the running dev server.
//
//   node scripts/export-check.mjs [--tools <dir>] [--only novel|game|import] [--keep] [--base <url>]
//
// It signs in as its own account (export-check@dramatis.local, made on the first run) and works on fresh
// copies of the demo projects, deleted at the end (--keep leaves them), so the demo account is never touched.
// --tools <dir>: a folder whose node_modules holds inkjs, ajv and ajv-formats, with epubcheck-*/epubcheck.jar
// and harlowe/format.js beside it. With them the Ink is compiled and played to every ending, the JSON is
// validated by ajv, the EPUB goes through epubcheck and the Twee is played in Harlowe; without them every file
// gets the structural checks below (and the JSON a small validator of the schema's own keywords).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const base = option('base', process.env.DRAMATIS_BASE_URL ?? 'http://localhost:3070').replace(/\/$/, '')
const only = option('only', '')
const tools = option('tools', process.env.DRAMATIS_EXPORT_TOOLS ?? '')
const keep = args.includes('--keep')
const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const out = join(root, '.checks', 'export')
mkdirSync(out, { recursive: true })

const EMAIL = 'export-check@dramatis.local'
const PASSWORD = 'export-check-password'
const COOKIE_FILE = join(root, '.checks', 'export-check.cookie')

// ---------------------------------------------------------------- reporting

let failures = 0
function report(name, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
}
function skip(name, why) {
  console.log(`skip ${name}: ${why}`)
}
async function check(name, fn) {
  try {
    const detail = await fn()
    report(name, true, detail ?? '')
  }
  catch (error) {
    report(name, false, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

// ---------------------------------------------------------------- the API

let cookie = existsSync(COOKIE_FILE) ? readFileSync(COOKIE_FILE, 'utf8').trim() : ''
function keepCookie(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(';')[0]
    if (pair.startsWith('dramatis-session=')) {
      cookie = pair
      writeFileSync(COOKIE_FILE, cookie)
    }
  }
}
async function call(method, path, body, headers = {}) {
  const form = body instanceof FormData
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined && !form ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : form || body instanceof Uint8Array ? body : JSON.stringify(body),
  })
  keepCookie(res)
  return res
}
async function json(method, path, body) {
  const res = await call(method, path, body)
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null }
  catch { data = text }
  return { status: res.status, data }
}
async function download(method, path, body) {
  const res = await call(method, path, body)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${strFromU8(bytes).slice(0, 200)}`)
  const name = decodeURIComponent(res.headers.get('x-dramatis-filename') ?? 'file')
  writeFileSync(join(out, name), bytes)
  return { bytes, name, text: () => strFromU8(bytes) }
}
async function signIn() {
  if (cookie && (await call('GET', '/api/account')).ok) return
  let res = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })
  if (res.status === 401) res = await call('POST', '/api/auth/register', { name: 'Controllo esportazioni', email: EMAIL, password: PASSWORD, locale: 'it', timezone: 'Europe/Rome' })
  if (!res.ok) throw new Error(`cannot sign in as ${EMAIL}: ${res.status}`)
}
const created = []
async function forget(id) {
  await call('DELETE', `/api/projects/${id}`)
  await call('DELETE', `/api/projects/${id}?forever=1`)
}

// ---------------------------------------------------------------- the optional tools

const toolsRequire = tools && existsSync(join(tools, 'node_modules')) ? createRequire(join(tools, 'package.json')) : null
const tool = (name) => {
  try { return toolsRequire?.(name) ?? null }
  catch { return null }
}
const epubcheckJar = tools && existsSync(tools) ? readdirSync(tools).filter(d => d.startsWith('epubcheck')).map(d => join(tools, d, 'epubcheck.jar')).find(existsSync) : null
const harloweFormat = tools && existsSync(join(tools, 'harlowe', 'format.js')) ? join(tools, 'harlowe', 'format.js') : null
const has = (command) => {
  try {
    execFileSync('which', [command], { stdio: 'ignore' })
    return true
  }
  catch { return false }
}

// ---------------------------------------------------------------- format checks

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g

function docxCheck(bytes) {
  const files = unzipSync(bytes)
  const styles = strFromU8(files['word/styles.xml'] ?? new Uint8Array())
  const document = strFromU8(files['word/document.xml'] ?? new Uint8Array())
  assert(document.includes('<w:body>'), 'no document body')
  // The navigation pane of Word and LibreOffice lists the headings by their outline level.
  const outline = level => new RegExp(`<w:style[^>]*w:styleId="Heading${level + 1}"[\\s\\S]*?<w:outlineLvl w:val="${level}"/>`).test(styles)
  assert(outline(0) && outline(1), 'Heading 1 and 2 have no outline level')
  const headings = [1, 2, 3].map(n => (document.match(new RegExp(`<w:pStyle w:val="Heading${n}"/>`, 'g')) ?? []).length)
  assert(headings[0] + headings[1] > 0, 'no heading in the text')
  const nums = (document.match(/<w:numId w:val="\d+"\/>/g) ?? []).length
  return `headings ${headings.join('/')}, ${nums} list paragraphs`
}

function epubCheck(bytes, file) {
  assert(strFromU8(bytes.subarray(30, 38)) === 'mimetype' && bytes[8] === 0, 'the mimetype is not the first, stored entry')
  const files = unzipSync(bytes)
  assert(strFromU8(files.mimetype) === 'application/epub+zip', 'wrong mimetype')
  const opf = strFromU8(files['OEBPS/content.opf'])
  for (const href of opf.matchAll(/href="([^"]+)"/g)) assert(files[`OEBPS/${href[1]}`], `missing ${href[1]}`)
  assert(/epub:type="toc"/.test(strFromU8(files['OEBPS/nav.xhtml'])), 'no table of contents')
  const chapters = Object.keys(files).filter(n => /chapter-\d+\.xhtml$/.test(n)).length
  if (epubcheckJar && has('java')) {
    try {
      execFileSync('java', ['-jar', epubcheckJar, file], { stdio: 'pipe' })
    }
    catch (error) {
      const text = `${error.stdout ?? ''}${error.stderr ?? ''}`
      throw new Error(`epubcheck: ${(text.match(/^(ERROR|FATAL).*$/m) ?? [text.slice(-200)])[0]}`)
    }
    return `${chapters} chapters, epubcheck clean`
  }
  return `${chapters} chapters (epubcheck not run)`
}

function txtCheck(bytes, text) {
  assert(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'no byte order mark')
  assert(!/[^\r]\n/.test(text), 'a line ends without CR')
  const breaks = (text.match(/\r\n\*\*\*\r\n/g) ?? []).length
  return `${text.split('\r\n').length} lines, ${breaks} separators`
}

/** The keywords the dramatis-game schema uses, enough to validate an export without ajv. */
function schemaErrors(schema, value, path = '') {
  const errors = []
  const types = schema.type ? [schema.type].flat() : null
  const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)
  if (types && !types.some(t => t === typeOf(value) || (t === 'number' && typeof value === 'number'))) return [`${path}: ${typeOf(value)} is not ${types.join('|')}`]
  if ('const' in schema && value !== schema.const) errors.push(`${path}: not ${schema.const}`)
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`)
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: ${value} does not match ${schema.pattern}`)
  if (schema.format === 'uuid' && typeof value === 'string' && !/^[0-9a-f-]{36}$/i.test(value)) errors.push(`${path}: not a uuid`)
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`)
  if (schema.anyOf && !schema.anyOf.some(s => !schemaErrors(s, value, path).length)) errors.push(`${path}: matches none of anyOf`)
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}/${key}: missing`)
    for (const [key, inner] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...schemaErrors(schema.properties[key], inner, `${path}/${key}`))
      else if (schema.additionalProperties === false) errors.push(`${path}/${key}: not allowed`)
      else if (typeof schema.additionalProperties === 'object') errors.push(...schemaErrors(schema.additionalProperties, inner, `${path}/${key}`))
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, i) => errors.push(...schemaErrors(schema.items, item, `${path}/${i}`)))
  return errors
}

function gameJsonCheck(data, schema) {
  const Ajv = tool('ajv/dist/2020')
  let errors
  if (Ajv) {
    const ajv = new Ajv.default({ allErrors: true, strict: true, allowUnionTypes: true })
    tool('ajv-formats')?.(ajv)
    const validate = ajv.compile(schema)
    errors = validate(data) ? [] : validate.errors.map(e => `${e.instancePath} ${e.message}`)
  }
  else errors = schemaErrors(schema, data)
  assert(!errors.length, errors.slice(0, 3).join('; '))
  const codes = new Set(data.scenes.map(s => s.code))
  for (const scene of data.scenes) for (const choice of scene.choices) assert(codes.has(choice.target), `${scene.code} leads to ${choice.target}, not a scene`)
  const choices = data.scenes.reduce((n, s) => n + s.choices.length, 0)
  const implicit = data.scenes.reduce((n, s) => n + s.choices.filter(c => c.implicit).length, 0)
  return `${Ajv ? 'ajv' : 'schema keywords'}: valid, ${data.scenes.length} scenes, ${choices} choices (${implicit} implicit)`
}

function tweePassages(text) {
  const passages = []
  let current = null
  for (const line of text.split('\n')) {
    const header = /^:: (.+?)(?: \[([^\]]*)\])?(?: (\{.*\}))?\s*$/.exec(line)
    if (header) {
      current = { name: header[1], tags: header[2] ?? '', meta: header[3] ? JSON.parse(header[3]) : {}, text: [] }
      passages.push(current)
    }
    else current?.text.push(line)
  }
  for (const p of passages) p.text = p.text.join('\n').replace(/\n+$/, '')
  return passages
}

async function tweeCheck(text, format) {
  const passages = tweePassages(text)
  const data = JSON.parse(passages.find(p => p.name === 'StoryData').text)
  const story = passages.filter(p => p.name !== 'StoryData' && p.name !== 'StoryTitle')
  const names = new Set(story.map(p => p.name))
  assert(names.has(data.start), `the start passage ${data.start} does not exist`)
  assert(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(data.ifid), 'the IFID is not a version 4 UUID in capitals')
  const targets = format === 'harlowe'
    ? /\[\[[^\]]*?->([^\]]+)\]\]|\(go-to: "((?:[^"\\]|\\.)*)"\)|\(link-goto: "(?:[^"\\]|\\.)*", "((?:[^"\\]|\\.)*)"\)/g
    : /\[\[[^\]|]*\|([^\]]+)\]\]|<<link "(?:[^"\\]|\\.)*" "((?:[^"\\]|\\.)*)">>/g
  let links = 0
  for (const p of story) {
    for (const m of p.text.matchAll(targets)) {
      const target = (m[1] ?? m[2] ?? m[3]).replace(/\\"/g, '"')
      assert(names.has(target), `${p.name} leads to ${target}, not a passage`)
      links++
    }
  }
  const played = format === 'harlowe' && harloweFormat ? await playHarlowe(passages, data) : ''
  return `${story.length} passages, ${links} links${played}`
}

/** Builds the story with Harlowe and clicks through every path (bounded): errors and endings. */
async function playHarlowe(passages, data) {
  const { chromium } = createRequire(join(root, 'package.json'))('playwright')
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const title = passages.find(p => p.name === 'StoryTitle').text.trim()
  const story = passages.filter(p => p.name !== 'StoryData' && p.name !== 'StoryTitle')
  const startPid = story.findIndex(p => p.name === data.start) + 1
  // Markers for the walk: where it is, and with which state (a path is new when either is).
  const variables = [...(story.find(p => p.tags.includes('startup'))?.text ?? '').matchAll(/\(set: \$(\w+) to/g)].map(m => m[1])
  const state = variables.map(v => `${v.replace(/_/g, '&#95;')}=(print: $${v});`).join('')
  for (const p of story) if (!p.tags.includes('startup')) p.text = `<span class="pname" data-pname="${esc(p.name)}"></span><span class="vars" hidden>${state}</span>${p.text}`
  const storyData = `<tw-storydata name="${esc(title)}" startnode="${startPid}" creator="check" creator-version="1" ifid="${data.ifid}" zoom="1" format="Harlowe" format-version="3.3.9" options="" hidden>${story.map((p, i) => `<tw-passagedata pid="${i + 1}" name="${esc(p.name)}" tags="${esc(p.tags)}" position="0,0" size="100,100">${esc(p.text)}</tw-passagedata>`).join('')}</tw-storydata>`
  let format = null
  vm.runInNewContext(readFileSync(harloweFormat, 'utf8'), { window: { storyFormat: (o) => { format = o } } })
  const file = join(out, 'harlowe-story.html')
  writeFileSync(file, format.source.replace('{{STORY_NAME}}', esc(title)).replace('{{STORY_DATA}}', storyData))
  const browser = await chromium.launch()
  const errors = new Set()
  const endings = new Set()
  const seen = new Set()
  const queue = [[]]
  let runs = 0
  while (queue.length && runs < 300) {
    const path = queue.shift()
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('pageerror', e => errors.add(e.message))
    await page.goto(`file://${file}`)
    await page.waitForSelector('tw-passage', { timeout: 5000 })
    let ok = true
    for (const pick of path) {
      const links = page.locator('tw-passage tw-link')
      if (await links.count() <= pick) {
        ok = false
        break
      }
      const before = await page.$('tw-passage')
      await links.nth(pick).click()
      await page.waitForFunction(el => !el.isConnected && document.querySelectorAll('tw-passage').length === 1, before, { timeout: 5000 })
    }
    runs++
    if (ok) {
      for (const error of await page.locator('tw-error, tw-expression[type="error"]').allTextContents()) errors.add(error.slice(0, 120))
      const name = await page.locator('tw-passage .pname').first().getAttribute('data-pname')
      const links = await page.locator('tw-passage tw-link').allTextContents()
      const key = `${name}|${await page.locator('tw-passage .vars').first().textContent()}|${links.join('/')}`
      if (!links.length) endings.add(name)
      else if (!seen.has(key) && path.length < 30) {
        seen.add(key)
        links.forEach((_, i) => queue.push([...path, i]))
      }
    }
    await context.close()
  }
  await browser.close()
  assert(!errors.size, `Harlowe: ${[...errors][0]}`)
  return `, Harlowe played ${runs} paths to ${endings.size} endings (${[...endings].map(e => e.split(' ')[0]).join(' ')})`
}

function inkCheck(text) {
  const knots = new Set([...text.matchAll(/^=== (\w+) ===$/gm)].map(m => m[1]))
  const diverts = [...text.matchAll(/->\s*(\w+)/g)].map(m => m[1]).filter(name => name !== 'END' && name !== 'DONE')
  for (const target of diverts) assert(knots.has(target), `divert to ${target}, not a knot`)
  const Compiler = tool('inkjs/compiler/Compiler')?.Compiler
  const ink = tool('inkjs')
  if (!Compiler || !ink) return `${knots.size} knots, ${diverts.length} diverts (inkjs not available)`
  const issues = []
  const story = new Compiler(text, { errorHandler: (message, type) => { if (type >= 1) issues.push(message) } }).Compile()
  assert(story && !issues.length, `inklecate: ${issues[0] ?? 'did not compile'}`)
  // Every path, choice by choice (bounded), to the codes where the story ends.
  const compiled = story.ToJson()
  const endings = new Set()
  const seen = new Set()
  const queue = [[]]
  let runs = 0
  while (queue.length && runs < 3000) {
    const path = queue.shift()
    const s = new ink.Story(compiled)
    let code = '?'
    const play = () => {
      while (s.canContinue) {
        s.Continue()
        for (const tag of s.currentTags) if (tag.startsWith('code:')) code = tag.slice(5).trim()
      }
    }
    for (const pick of path) {
      play()
      s.ChooseChoiceIndex(pick)
    }
    play()
    runs++
    if (!s.currentChoices.length) {
      endings.add(code)
      continue
    }
    const key = `${code}|${s.state.ToJson().length}|${s.currentChoices.map(c => c.text).join('/')}`
    if (seen.has(key) || path.length > 40) continue
    seen.add(key)
    s.currentChoices.forEach((_, i) => queue.push([...path, i]))
  }
  return `${knots.size} knots, compiled clean, ${runs} paths to ${endings.size} endings (${[...endings].join(' ')})`
}

/** RFC 4180: fields with the delimiter, quotes or line breaks are quoted, quotes doubled. */
function parseCsv(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    }
    else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
    else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function csvCheck(bytes, delimiter) {
  assert(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'no byte order mark')
  const rows = parseCsv(strFromU8(bytes.subarray(3)), delimiter)
  const header = rows[0]
  assert(header.join(',') === 'line_id,scene_code,act,chapter,scene_title,scene_kind,order,speaker,speaker_id,direction,text,words,scene_status', `header ${header.join(',')}`)
  for (const row of rows.slice(1)) assert(row.length === header.length, `a row has ${row.length} fields`)
  const ids = rows.slice(1).map(r => r[0]).filter(Boolean)
  assert(new Set(ids).size === ids.length, 'a line id is repeated')
  for (const id of ids) assert(/^S\d{3,}-L\d{3,}$/.test(id), `line id ${id}`)
  return { lines: rows.length - 1, ids }
}

function normalisedBackup(bytes, { dropTitle = false } = {}) {
  const files = unzipSync(bytes)
  const data = JSON.parse(strFromU8(files['dramatis.json']))
  delete data.exportedAt
  // The IFID of the Twine story is not copied: a restored project is another story (it gets its own).
  if (data.project?.settings) delete data.project.settings.ifid
  if (dropTitle) data.project.title = '<title>'
  const seen = new Map()
  const text = JSON.stringify(data).replace(UUID, (id) => {
    const key = id.toLowerCase()
    if (!seen.has(key)) seen.set(key, `<id${seen.size}>`)
    return seen.get(key)
  }).replace(TIME, '<time>')
  return { text, media: Object.keys(files).filter(n => n.startsWith('media/')).length, data }
}

// ---------------------------------------------------------------- one project, every format

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
const WEBP = Uint8Array.from(atob('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'), c => c.charCodeAt(0))

/** Gives the first character a PNG portrait (with its thumbnail) and the first location a WebP picture. */
async function addImages(id) {
  const bundle = (await json('GET', `/api/projects/${id}`)).data
  const attach = async (bytes, type, owner) => {
    if (!owner) return
    const form = new FormData()
    form.append('file', new Blob([bytes], { type }), `image.${type.split('/')[1]}`)
    form.append('thumb', new Blob([bytes], { type }), `thumb.${type.split('/')[1]}`)
    form.append('width', type === 'image/png' ? '2' : '1')
    form.append('height', type === 'image/png' ? '3' : '1')
    form.append('projectId', id)
    const media = await json('POST', '/api/media', form)
    assert(media.status === 200, `media upload answered ${media.status}`)
    const image = await json('POST', `/api/projects/${id}/images`, { ownerType: owner.type, ownerId: owner.id, mediaId: media.data.id, caption: 'Prova' })
    assert(image.status === 200, `image answered ${image.status}`)
  }
  await attach(PNG, 'image/png', bundle.characters[0] && { type: 'character', id: bundle.characters[0].id })
  await attach(WEBP, 'image/webp', bundle.locations[0] && { type: 'location', id: bundle.locations[0].id })
}

async function project(kind) {
  const demo = await json('POST', '/api/projects/demo', { kind, locale: 'it' })
  assert(demo.status === 200, `demo ${kind}: ${demo.status}`)
  const id = demo.data.id
  created.push(id)
  const api = `/api/projects/${id}/export`
  console.log(`-- ${kind}: ${demo.data.title}`)
  await addImages(id)

  for (const layout of ['manuscript', 'book']) {
    await check(`${kind} manuscript DOCX ${layout}`, async () => docxCheck((await download('POST', `${api}/manuscript`, { format: 'docx', layout, sceneTitles: true })).bytes))
  }
  await check(`${kind} manuscript EPUB`, async () => {
    const file = await download('POST', `${api}/manuscript`, { format: 'epub' })
    return epubCheck(file.bytes, join(out, file.name))
  })
  await check(`${kind} manuscript TXT`, async () => {
    const file = await download('POST', `${api}/manuscript`, { format: 'txt', separator: 'blank' })
    return txtCheck(file.bytes, file.text())
  })
  await check(`${kind} manuscript PDF data`, async () => {
    const { status, data } = await json('GET', `${api}/print?layout=manuscript&titlePage=true`)
    assert(status === 200 && data.sceneCount > 0, `print answered ${status}`)
    return `${data.sceneCount} scenes, ${data.parts.reduce((n, p) => n + p.chapters.length, 0)} chapters`
  })
  await check(`${kind} project document DOCX`, async () => {
    const { bytes } = await download('POST', `${api}/document`, { includeImages: true })
    const pictures = Object.keys(unzipSync(bytes)).filter(n => n.startsWith('word/media/') && !n.endsWith('/')).length
    assert(pictures === 1, `${pictures} pictures (the PNG portrait, not the WebP the browser would convert)`)
    return `${docxCheck(bytes)}, ${pictures} picture`
  })

  if (kind === 'game') {
    const schema = JSON.parse((await download('GET', `${api}/schema`)).text())
    await check('game JSON', async () => gameJsonCheck(JSON.parse((await download('POST', `${api}/json`, {})).text()), schema))
    for (const format of ['harlowe', 'sugarcube']) await check(`game Twee ${format}`, async () => tweeCheck((await download('POST', `${api}/twee`, { format })).text(), format))
    await check('game Ink', async () => inkCheck((await download('POST', `${api}/ink`, {})).text()))
    await check('game voice-over CSV', async () => {
      const comma = csvCheck((await download('POST', `${api}/vo-csv`, { delimiter: 'comma' })).bytes, ',')
      const semicolon = csvCheck((await download('POST', `${api}/vo-csv`, { delimiter: 'semicolon' })).bytes, ';')
      assert(comma.ids.join() === semicolon.ids.join(), 'the two exports give different line ids')
      return `${comma.lines} lines, the same ids twice`
    })
  }

  await check(`${kind} backup round trip`, async () => {
    const first = await download('GET', `${api}/backup`)
    const imported = await upload(first.name, first.bytes, 'application/zip')
    assert(imported.status === 200, `import answered ${imported.status} ${JSON.stringify(imported.data).slice(0, 200)}`)
    const second = await download('GET', `/api/projects/${imported.data.id}/export/backup`)
    const a = normalisedBackup(first.bytes)
    const b = normalisedBackup(second.bytes)
    if (a.text !== b.text) {
      let i = 0
      while (a.text[i] === b.text[i]) i++
      throw new Error(`different at ${i}: ${a.text.slice(i - 60, i + 60)} / ${b.text.slice(i - 60, i + 60)}`)
    }
    assert(a.media === b.media, `media ${a.media} / ${b.media}`)
    const counts = Object.entries(a.data).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${k} ${v.length}`).join(', ')
    return `identical (${counts}; ${a.media} media files)`
  })
}

// ---------------------------------------------------------------- the import guards

async function upload(name, bytes, type = 'application/octet-stream') {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), name)
  let result = await json('POST', '/api/projects/import', form)
  // Imports are limited to a few a minute for each author: the check waits for the next minute.
  if (result.status === 429 && !result.data?.data?.reason) {
    await new Promise(done => setTimeout(done, 61_000))
    result = await json('POST', '/api/projects/import', form)
  }
  if (result.status === 200) created.push(result.data.id)
  return result
}

/** A zip of one entry whose directory claims `claimed` bytes: what fflate would allocate up front. */
function lyingZip(name, claimed, level) {
  const zip = zipSync({ [name]: [strToU8('{"format":"dramatis-backup"}'), { level }] })
  const view = new DataView(zip.buffer)
  const central = zip.length - 22 - 46 - name.length
  view.setUint32(central + 24, claimed, true)
  return zip
}

async function imports() {
  console.log('-- import')
  const text = 'Perché è così? Città, virtù, più, però. «Sì», disse.'
  const firstScene = async (id) => {
    const bundle = await json('GET', `/api/projects/${id}`)
    const scene = bundle.data.scenes[0]
    const content = await json('GET', `/api/projects/${id}/scenes/${scene.id}/content`)
    return JSON.stringify(content.data.content)
  }
  await check('import Windows-1252 text', async () => {
    const bytes = Uint8Array.from(text, ch => ({ 'é': 0xE9, 'è': 0xE8, 'ì': 0xEC, 'à': 0xE0, 'ù': 0xF9, 'ò': 0xF2, '«': 0xAB, '»': 0xBB })[ch] ?? ch.charCodeAt(0))
    const result = await upload('racconto.txt', bytes, 'text/plain')
    assert(result.status === 200, `answered ${result.status}`)
    assert((await firstScene(result.data.id)).includes('Città, virtù, più, però'), 'the accents did not survive')
    return 'accents kept'
  })
  await check('import UTF-16 text', async () => {
    const body = new Uint8Array(2 + text.length * 2)
    body.set([0xFF, 0xFE])
    for (let i = 0; i < text.length; i++) new DataView(body.buffer).setUint16(2 + i * 2, text.charCodeAt(i), true)
    const result = await upload('racconto.txt', body, 'text/plain')
    assert(result.status === 200, `answered ${result.status} ${JSON.stringify(result.data?.data)}`)
    assert((await firstScene(result.data.id)).includes('Città, virtù, più, però'), 'the text did not survive')
    return 'read as UTF-16'
  })
  await check('import UTF-16 text without its mark', async () => {
    const body = new Uint8Array(text.length * 2)
    for (let i = 0; i < text.length; i++) new DataView(body.buffer).setUint16(i * 2, text.charCodeAt(i), true)
    const result = await upload('racconto.md', body, 'text/markdown')
    assert(result.status === 200, `answered ${result.status} ${JSON.stringify(result.data?.data)}`)
    assert((await firstScene(result.data.id)).includes('Città, virtù, più, però'), 'the text did not survive')
    return 'read as UTF-16'
  })
  await check('import UTF-8 text with a stray byte', async () => {
    const body = new Uint8Array([...strToU8(text), 0x0A, 0xE9, 0x0A])
    const result = await upload('racconto.txt', body, 'text/plain')
    assert(result.status === 200, `answered ${result.status}`)
    assert((await firstScene(result.data.id)).includes('Città, virtù, più, però'), 'the accents did not survive')
    return 'stays UTF-8'
  })
  await check('import refuses a zip that lies about its size', async () => {
    const answers = []
    for (const level of [0, 6]) {
      const result = await upload('bomb.dramatis.zip', lyingZip('dramatis.json', 300_000_000, level), 'application/zip')
      assert(result.status === 400 || result.status === 413, `answered ${result.status}`)
      answers.push(`${level ? 'deflated' : 'stored'} ${result.status} ${result.data?.data?.reason}`)
    }
    return answers.join(', ')
  })
  await check('import refuses an upload above the limit', async () => {
    // A request that declares 400 MB and sends a few bytes: the answer must come before the rest of the body.
    const status = await new Promise((done, fail) => {
      const req = request(`${base}/api/projects/import`, { method: 'POST', headers: { 'cookie': cookie, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(400 * 1024 * 1024) } }, (res) => {
        done(res.statusCode)
        res.resume()
        req.destroy()
      })
      req.on('error', error => (error.code === 'ECONNRESET' ? undefined : fail(error)))
      req.write('--x\r\n')
      setTimeout(() => fail(new Error('no answer before the body')), 5000)
    })
    assert(status === 413, `answered ${status}`)
    return `${status} before the body was read`
  })
  const backupWith = async (change) => {
    const demo = await json('POST', '/api/projects/demo', { kind: 'game', locale: 'it' })
    created.push(demo.data.id)
    const zip = await download('GET', `/api/projects/${demo.data.id}/export/backup`)
    const files = unzipSync(zip.bytes)
    const data = JSON.parse(strFromU8(files['dramatis.json']))
    change(data)
    return upload('crafted.json', strToU8(JSON.stringify(data)), 'application/json')
  }
  await check('import refuses a variable name that is not one', async () => {
    const result = await backupWith((data) => { data.variables[0].name = 'x to 1)(go-to: "S001")(set: $y' })
    assert(result.status === 400 && result.data?.data?.reason === 'invalid', `answered ${result.status} ${result.data?.data?.reason}`)
    return 'invalid'
  })
  await check('import refuses repeated scene codes', async () => {
    const result = await backupWith((data) => { data.scenes[1].code = data.scenes[0].code })
    assert(result.status === 400 && result.data?.data?.reason === 'invalid', `answered ${result.status} ${result.data?.data?.reason}`)
    return 'invalid'
  })
  await check('import drops unknown colours and the IFID', async () => {
    const result = await backupWith((data) => {
      data.characters[0].color = 'red; background: url(x)'
      data.project.settings.ifid = 'D674C58C-DEFA-4F70-B7A2-27742230C0FC'
    })
    assert(result.status === 200, `answered ${result.status}`)
    const bundle = await json('GET', `/api/projects/${result.data.id}`)
    assert(bundle.data.characters.every(c => c.color === '' || /^[a-z]+$/.test(c.color)), 'a colour was kept')
    assert(!bundle.data.project.settings.ifid, 'the IFID was kept')
    return 'restored without them'
  })
}

// ---------------------------------------------------------------- run

await signIn()
try {
  if (!only || only === 'novel') await project('novel')
  if (!only || only === 'game') await project('game')
  if (!only || only === 'import') await imports()
}
finally {
  if (!keep) for (const id of created) await forget(id)
}
console.log(`export-check: ${failures ? `${failures} FAILED` : 'all passed'}${tools ? '' : ' (structural checks only: pass --tools for ink, ajv, epubcheck, Harlowe)'}`)
process.exit(failures ? 1 : 0)
