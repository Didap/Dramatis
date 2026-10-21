#!/usr/bin/env node
// End-to-end check of the API against the running dev server: a throwaway account goes through
// the main flows and is deleted at the end. Prints one line per step and exits 1 on the first failure.
//   node scripts/smoke.mjs [--base http://localhost:3070] [--keep]
const args = process.argv.slice(2)
const baseIndex = args.indexOf('--base')
const base = (baseIndex >= 0 ? args[baseIndex + 1] : process.env.DRAMATIS_BASE_URL ?? 'http://localhost:3070').replace(/\/$/, '')
const keep = args.includes('--keep')

let cookie = ''
let failures = 0

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const set = res.headers.getSetCookie?.() ?? []
  for (const c of set) {
    const pair = c.split(';')[0]
    if (pair.startsWith('dramatis-session=')) cookie = pair
  }
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null }
  catch { data = text }
  return { status: res.status, data }
}

function step(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures++
  return ok
}

function expect(name, res, status) {
  const ok = res.status === status
  return step(name, ok, ok ? '' : `expected ${status}, got ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`)
}

const email = `smoke-${Date.now()}@dramatis.local`
try {
  expect('register', await api('POST', '/api/auth/register', { name: 'Smoke Test', email, password: 'smoke-password-1', locale: 'it', timezone: 'Europe/Rome' }), 200)
  expect('anonymous access refused', await fetch(`${base}/api/projects`).then(r => ({ status: r.status })), 401)

  const created = await api('POST', '/api/projects', { title: 'Smoke', kind: 'game', structure: 'three_acts' })
  expect('create project from a structure', created, 200)
  const pid = created.data?.id
  const bundle = await api('GET', `/api/projects/${pid}`)
  expect('load bundle', bundle, 200)
  step('structure created chapters', (bundle.data?.chapters?.length ?? 0) > 0, `${bundle.data?.chapters?.length ?? 0} chapters`)
  step('game got the default codex categories', bundle.data?.codexCategories?.length === 7, `${bundle.data?.codexCategories?.length}`)

  const anna = await api('POST', `/api/projects/${pid}/characters`, { name: 'Anna', importance: 'main' })
  expect('create character', anna, 200)
  step('character got a colour', !!anna.data?.color, anna.data?.color)
  const marco = await api('POST', `/api/projects/${pid}/characters`, { name: 'Marco' })
  expect('update character', await api('PATCH', `/api/projects/${pid}/characters/${anna.data.id}`, { tagline: 'La sorella maggiore', profile: { personal: { answers: { full_name: 'Anna Ferri' } } } }), 200)
  const merged = await api('PATCH', `/api/projects/${pid}/characters/${anna.data.id}`, { profile: { personal: { answers: { nickname: 'Annina' } } } })
  step('profile answers are merged', merged.data?.profile?.personal?.answers?.full_name === 'Anna Ferri' && merged.data?.profile?.personal?.answers?.nickname === 'Annina')

  const desc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prima versione.' }] }] }
  const first = await api('PATCH', `/api/projects/${pid}/characters/${anna.data.id}`, { description: desc, $base: { description: 0 } })
  step('long text saved with version 1', first.data?.versions?.description === 1)
  const late = await api('PATCH', `/api/projects/${pid}/characters/${anna.data.id}`, { description: { ...desc, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Da un altro dispositivo.' }] }] }, $base: { description: 0 } })
  step('stale long text kept as a conflict note', late.data?.$conflicts?.[0]?.note?.title?.startsWith('Conflitto: Anna'), late.data?.$conflicts?.[0]?.note?.title)
  step('the newer text was not overwritten', JSON.stringify(late.data?.description).includes('Prima versione'))

  expect('reject foreign reference', await api('POST', `/api/projects/${pid}/relations`, { sourceType: 'character', sourceId: anna.data.id, targetType: 'character', targetId: '00000000-0000-4000-8000-000000000000', kind: 'family' }), 400)
  expect('create relation', await api('POST', `/api/projects/${pid}/relations`, { sourceType: 'character', sourceId: anna.data.id, targetType: 'character', targetId: marco.data.id, kind: 'family', label: 'sorella', reverseLabel: 'fratello' }), 200)
  const place = await api('POST', `/api/projects/${pid}/locations`, { name: 'Porto' })
  expect('invalid kind for the pair refused', await api('POST', `/api/projects/${pid}/relations`, { sourceType: 'character', sourceId: anna.data.id, targetType: 'location', targetId: place.data.id, kind: 'family' }), 400)
  const lives = await api('POST', `/api/projects/${pid}/relations`, { sourceType: 'character', sourceId: anna.data.id, targetType: 'location', targetId: place.data.id, kind: 'place' })
  step('place relation directed by default', lives.data?.directed === true)

  const chapter = await api('POST', `/api/projects/${pid}/chapters`, { title: 'Uno' })
  expect('create chapter', chapter, 200)
  const scene = await api('POST', `/api/projects/${pid}/scenes`, { chapterId: chapter.data.id, title: 'Apertura', manualTags: [{ type: 'character', id: anna.data.id }] })
  expect('create scene', scene, 200)
  step('scene has a revision', !!scene.data?.currentRevisionId)
  step('scene got a stable code', /^S\d{3}$/.test(scene.data?.code ?? ''), scene.data?.code)
  step('manual tag stored', scene.data?.tags?.[`character:${anna.data.id}`]?.manual === true && scene.data?.characterIds?.includes(anna.data.id))
  const scene2 = await api('POST', `/api/projects/${pid}/scenes`, { chapterId: chapter.data.id, title: 'Seguito' })

  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Il mare era fermo quella mattina. ' }, { type: 'mention', attrs: { id: `location:${place.data.id}`, label: 'Porto' } }, { type: 'text', text: ' dormiva.' }] }] }
  const content = await api('GET', `/api/projects/${pid}/scenes/${scene.data.id}/content`)
  expect('get scene content', content, 200)
  const saved = await api('PUT', `/api/projects/${pid}/scenes/${scene.data.id}/content`, { content: doc, revisionId: content.data.revisionId, version: content.data.version })
  expect('save scene content', saved, 200)
  step('word count computed on the server', saved.data?.wordCount === 8, `got ${saved.data?.wordCount}`)
  step('mention tagged the place', saved.data?.scene?.tags?.[`location:${place.data.id}`]?.mentions === 1)
  const dialogue = { type: 'doc', content: [{ type: 'dialogueLine', attrs: { speakerId: marco.data.id, speakerName: 'Marco', direction: 'piano', lineId: null }, content: [{ type: 'text', text: 'Resta qui.' }] }, { type: 'dialogueLine', attrs: { speakerId: marco.data.id, speakerName: 'Marco', direction: '', lineId: null }, content: [{ type: 'text', text: 'Ti prego.' }] }] }
  const c2 = await api('GET', `/api/projects/${pid}/scenes/${scene2.data.id}/content`)
  const savedLines = await api('PUT', `/api/projects/${pid}/scenes/${scene2.data.id}/content`, { content: dialogue, revisionId: c2.data.revisionId, version: c2.data.version })
  expect('save dialogue lines', savedLines, 200)
  const ids = savedLines.data?.content?.content?.map(n => n.attrs.lineId) ?? []
  step('lines got ids from the scene code', ids.length === 2 && ids[0] !== ids[1] && ids.every(id => id.startsWith(`${scene2.data.code}-L`)), ids.join(' '))
  step('speaker tagged with two lines', savedLines.data?.scene?.tags?.[`character:${marco.data.id}`]?.lines === 2)
  const untag = await api('PATCH', `/api/projects/${pid}/scenes/${scene2.data.id}`, { manualTags: [] })
  step('removing manual tags keeps the speaker', untag.data?.characterIds?.includes(marco.data.id))

  const retry = await api('PUT', `/api/projects/${pid}/scenes/${scene.data.id}/content`, { content: doc, revisionId: content.data.revisionId, version: content.data.version })
  expect('stale save of the same text is a success', retry, 200)
  step('no new version for the same text', retry.data?.version === saved.data?.version, `got ${retry.data?.version}`)
  const bulkText = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Il lago era fermo quella mattina.' }] }] }
  const bulk = await api('PUT', `/api/projects/${pid}/scenes/${scene.data.id}/content`, { content: bulkText, revisionId: retry.data?.revisionId, version: retry.data?.version, snapshot: 'before_bulk' })
  expect('save after replace all', bulk, 200)
  const states = await api('GET', `/api/projects/${pid}/scenes/${scene.data.id}/snapshots`)
  step('text before replace all kept in the history', states.data?.some?.(x => x.reason === 'before_bulk'), JSON.stringify(states.data?.map?.(x => x.reason)))
  const back = await api('PUT', `/api/projects/${pid}/scenes/${scene.data.id}/content`, { content: doc, revisionId: bulk.data?.revisionId, version: bulk.data?.version })
  expect('save the text back', back, 200)
  const otherText = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Il mare si mosse.' }] }] }
  const stale = await api('PUT', `/api/projects/${pid}/scenes/${scene.data.id}/content`, { content: otherText, revisionId: content.data.revisionId, version: content.data.version })
  expect('stale save answered 409', stale, 409)
  step('stale text kept as a conflict revision', stale.data?.data?.conflictRevision?.label?.startsWith('Conflitto del'))

  const revision = await api('POST', `/api/projects/${pid}/scenes/${scene.data.id}/revisions`, { label: 'Seconda stesura' })
  expect('new revision', revision, 200)
  const revisions = await api('GET', `/api/projects/${pid}/scenes/${scene.data.id}/revisions`)
  step('three revisions (original, conflict, new)', revisions.data?.length === 3, `got ${revisions.data?.length}`)
  expect('use revision 1 again', await api('PATCH', `/api/projects/${pid}/scenes/${scene.data.id}/revisions/${revisions.data[0].id}`, { current: true }), 200)
  expect('revision to the trash', await api('DELETE', `/api/projects/${pid}/scenes/${scene.data.id}/revisions/${revision.data.revision.id}`), 200)

  const trust = await api('POST', `/api/projects/${pid}/variables`, { name: 'trust', type: 'number', defaultValue: '0' })
  expect('variable', trust, 200)
  expect('bad variable name refused', await api('POST', `/api/projects/${pid}/variables`, { name: 'Trust Level' }), 400)
  const link = await api('POST', `/api/projects/${pid}/links`, { fromSceneId: scene.data.id, toSceneId: scene2.data.id, label: 'Segui Anna', conditions: { mode: 'all', clauses: [{ variableId: trust.data.id, op: 'gte', value: '1' }] }, effects: [{ variableId: trust.data.id, op: 'add', value: '1' }] })
  expect('choice between scenes', link, 200)
  expect('condition on an unknown variable refused', await api('POST', `/api/projects/${pid}/links`, { fromSceneId: scene.data.id, toSceneId: scene2.data.id, conditions: { mode: 'all', clauses: [{ variableId: '00000000-0000-4000-8000-000000000000', op: 'is_true' }] } }), 400)
  expect('duplicate variable refused', await api('POST', `/api/projects/${pid}/variables`, { name: 'trust', type: 'number' }), 409)
  expect('variable to the trash', await api('DELETE', `/api/projects/${pid}/variables/${trust.data.id}`), 200)
  expect('purge variable', await api('POST', `/api/projects/${pid}/trash/purge`, { collection: 'variables', id: trust.data.id }), 200)
  const afterVar = await api('GET', `/api/projects/${pid}`)
  const cleaned = afterVar.data?.links?.find(l => l.id === link.data.id)
  step('purged variable left the choice', cleaned && cleaned.conditions.clauses.length === 0 && cleaned.effects.length === 0)

  expect('reorder scenes', await api('POST', `/api/projects/${pid}/reorder`, { collection: 'scenes', ids: [scene2.data.id, scene.data.id], chapterId: chapter.data.id }), 200)
  const stats = await api('GET', `/api/projects/${pid}/stats`)
  expect('writing stats', stats, 200)
  step('words written today', stats.data?.todayAdded === 14, `got ${stats.data?.todayAdded}`)

  const trashed = await api('DELETE', `/api/projects/${pid}/chapters/${chapter.data.id}`)
  expect('chapter to the trash', trashed, 200)
  step('its scenes left with it', trashed.data?.cascade?.scenes?.length === 2)
  const trash = await api('GET', `/api/projects/${pid}/trash`)
  step('trash lists the batch', trash.data?.filter(i => i.withParent && i.collection === 'scenes').length === 2, `got ${trash.data?.length}`)
  expect('restore one scene alone', await api('POST', `/api/projects/${pid}/trash/restore`, { collection: 'scenes', id: scene.data.id }), 200)
  const alone = await api('GET', `/api/projects/${pid}`)
  const restoredInto = alone.data?.chapters?.find(c => c.id === alone.data?.scenes?.find(s => s.id === scene.data.id)?.chapterId)
  step('it went to "Ripristinati"', restoredInto?.title === 'Ripristinati', restoredInto?.title)
  expect('restore the chapter', await api('POST', `/api/projects/${pid}/trash/restore`, { collection: 'chapters', id: chapter.data.id }), 200)
  const after = await api('GET', `/api/projects/${pid}`)
  step('the rest of the batch came back', after.data?.scenes?.some(s => s.id === scene2.data.id))

  // A relationship's evolution points to the project's own chapters; a chapter deleted for good leaves its steps.
  const bond = await api('POST', `/api/projects/${pid}/relations`, { sourceType: 'character', sourceId: marco.data.id, targetType: 'location', targetId: place.data.id, kind: 'place' })
  const later = await api('POST', `/api/projects/${pid}/chapters`, { title: 'Due' })
  const stepAt = chapterId => [{ id: 'step-1', side: 'target', chapterId, intensity: 3, note: 'cambia' }]
  expect('reject a foreign chapter in a step', await api('PATCH', `/api/projects/${pid}/relations/${bond.data.id}`, { evolution: stepAt('00000000-0000-4000-8000-000000000000') }), 400)
  const evolved = await api('PATCH', `/api/projects/${pid}/relations/${bond.data.id}`, { evolution: stepAt(later.data.id), reverseIntensity: 1 })
  step('evolution and intensity per side saved', evolved.data?.evolution?.[0]?.chapterId === later.data.id && evolved.data?.reverseIntensity === 1)
  expect('chapter of the step to the trash', await api('DELETE', `/api/projects/${pid}/chapters/${later.data.id}`), 200)
  expect('purge that chapter', await api('POST', `/api/projects/${pid}/trash/purge`, { collection: 'chapters', id: later.data.id }), 200)
  const forgot = await api('GET', `/api/projects/${pid}`)
  const kept = forgot.data?.relations?.find(r => r.id === bond.data.id)?.evolution?.[0]
  step('the step lost the chapter and kept its intensity', kept?.chapterId === null && kept?.intensity === 3, JSON.stringify(kept))

  expect('character to the trash', await api('DELETE', `/api/projects/${pid}/characters/${anna.data.id}`), 200)
  const hidden = await api('GET', `/api/projects/${pid}`)
  step('its relationships are hidden', !hidden.data?.relations?.some(r => r.sourceId === anna.data.id || r.targetId === anna.data.id))
  expect('purge character', await api('POST', `/api/projects/${pid}/trash/purge`, { collection: 'characters', id: anna.data.id }), 200)
  const purged = await api('GET', `/api/projects/${pid}`)
  step('purge removed its scene tags', purged.data?.scenes?.every(s => !s.characterIds.includes(anna.data.id) && !s.tags[`character:${anna.data.id}`]))

  expect('unknown project is 404', await api('GET', '/api/projects/00000000-0000-4000-8000-000000000000'), 404)

  if (!keep) {
    expect('project to the trash', await api('DELETE', `/api/projects/${pid}`), 200)
    expect('trashed project is hidden', await api('GET', `/api/projects/${pid}`), 404)
    expect('restore project', await api('POST', `/api/projects/${pid}/restore`), 200)
    expect('project to the trash again', await api('DELETE', `/api/projects/${pid}`), 200)
    expect('delete project forever', await api('DELETE', `/api/projects/${pid}?forever=1`), 200)
  }
}
catch (error) {
  step('unexpected error', false, error.message)
}

console.log(failures ? `smoke: ${failures} failed` : 'smoke: all passed')
process.exit(failures ? 1 : 0)
