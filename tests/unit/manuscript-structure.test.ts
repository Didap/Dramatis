import { describe, expect, it, vi } from 'vitest'
import { chapterNumberText, numberWords, placeAt, planStep, roman, type StructureShape } from '../../app/components/manuscript/structure-model'

// The parts endpoint is a Nitro handler: only its pure plans are tested here.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})
const { planPartsOff, planPartsOn, readingOrder } = await import('../../server/api/projects/[projectId]/manuscript/parts.post')

/** An outline: parts with their chapters (or a flat list of chapters), loose chapters, scenes per chapter. */
function outline(options: { parts?: [string, string[]][], loose?: string[], flat?: string[], scenes?: Record<string, string[]> }): StructureShape {
  const usesParts = !options.flat
  const chapters = usesParts
    ? [...(options.loose ?? []).map(id => ({ id, partId: null })), ...(options.parts ?? []).flatMap(([partId, ids]) => ids.map(id => ({ id, partId })))]
    : options.flat!.map(id => ({ id, partId: null }))
  const scenes = options.scenes ?? {}
  return {
    usesParts,
    parts: (options.parts ?? []).map(([id]) => id),
    chapters,
    scenesOf: chapterId => scenes[chapterId] ?? [],
    chapterOf: sceneId => Object.keys(scenes).find(chapterId => scenes[chapterId]!.includes(sceneId)),
  }
}

describe('planStep: scenes', () => {
  const shape = outline({ parts: [['P1', ['c1', 'c2']], ['P2', ['c3']]], scenes: { c1: ['a', 'b'], c2: ['c'], c3: ['d', 'e'] } })

  it('moves a scene within its chapter', () => {
    expect(planStep(shape, 'scene', 'a', 1)).toEqual({ kind: 'scene', chapterId: 'c1', index: 1 })
    expect(planStep(shape, 'scene', 'e', -1)).toEqual({ kind: 'scene', chapterId: 'c3', index: 0 })
  })

  it('crosses into the next chapter at its start, and the previous one at its end, across parts too', () => {
    expect(planStep(shape, 'scene', 'b', 1)).toEqual({ kind: 'scene', chapterId: 'c2', index: 0 })
    expect(planStep(shape, 'scene', 'c', -1)).toEqual({ kind: 'scene', chapterId: 'c1', index: undefined })
    expect(planStep(shape, 'scene', 'c', 1)).toEqual({ kind: 'scene', chapterId: 'c3', index: 0 })
  })

  it('stops at the very first and the very last scene', () => {
    expect(planStep(shape, 'scene', 'a', -1)).toBeNull()
    expect(planStep(shape, 'scene', 'e', 1)).toBeNull()
  })

  it('stays in its chapter on the chapter page', () => {
    expect(planStep(shape, 'scene', 'b', 1, { crossChapters: false })).toBeNull()
    expect(planStep(shape, 'scene', 'c', -1, { crossChapters: false })).toBeNull()
    expect(planStep(shape, 'scene', 'a', 1, { crossChapters: false })).toEqual({ kind: 'scene', chapterId: 'c1', index: 1 })
  })

  it('crosses empty chapters one at a time', () => {
    const gap = outline({ flat: ['c1', 'c2', 'c3'], scenes: { c1: ['a'], c2: [], c3: ['b'] } })
    expect(planStep(gap, 'scene', 'a', 1)).toEqual({ kind: 'scene', chapterId: 'c2', index: 0 })
  })
})

describe('planStep: chapters and parts', () => {
  const shape = outline({ loose: ['x1', 'x2'], parts: [['P1', ['c1', 'c2']], ['P2', ['c3']]] })

  it('moves a chapter within its part', () => {
    expect(planStep(shape, 'chapter', 'c1', 1)).toEqual({ kind: 'chapter', partId: 'P1', index: 1 })
  })

  it('crosses into the next part at its start and the previous part at its end', () => {
    expect(planStep(shape, 'chapter', 'c2', 1)).toEqual({ kind: 'chapter', partId: 'P2', index: 0 })
    expect(planStep(shape, 'chapter', 'c3', -1)).toEqual({ kind: 'chapter', partId: 'P1', index: undefined })
  })

  it('takes a chapter outside the parts into the first part, never back out', () => {
    expect(planStep(shape, 'chapter', 'x1', 1)).toEqual({ kind: 'chapter', partId: null, index: 1 })
    expect(planStep(shape, 'chapter', 'x2', 1)).toEqual({ kind: 'chapter', partId: 'P1', index: 0 })
    expect(planStep(shape, 'chapter', 'x1', -1)).toBeNull()
    expect(planStep(shape, 'chapter', 'c1', -1)).toBeNull()
    expect(planStep(shape, 'chapter', 'c3', 1)).toBeNull()
  })

  it('moves among all chapters when parts are off', () => {
    const flat = outline({ flat: ['c1', 'c2', 'c3'] })
    expect(planStep(flat, 'chapter', 'c2', -1)).toEqual({ kind: 'chapter', partId: null, index: 0 })
    expect(planStep(flat, 'chapter', 'c3', 1)).toBeNull()
  })

  it('moves parts within the list', () => {
    expect(planStep(shape, 'part', 'P1', 1)).toEqual({ kind: 'part', index: 1 })
    expect(planStep(shape, 'part', 'P1', -1)).toBeNull()
    expect(planStep(shape, 'part', 'P2', 1)).toBeNull()
  })

  it('places an item in a list', () => {
    expect(placeAt(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
    expect(placeAt(['a', 'b'], 'x')).toEqual(['a', 'b', 'x'])
    expect(placeAt(['a', 'b'], 'x', 0)).toEqual(['x', 'a', 'b'])
  })
})

describe('numbers', () => {
  it('writes Roman numerals for acts', () => {
    expect([1, 4, 9, 14, 40, 1994].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'MCMXCIV'])
  })

  it('writes chapter numbers in words as the export does', () => {
    expect([1, 21, 23, 28, 30, 100, 108, 180, 999].map(n => numberWords(n, 'it'))).toEqual(['uno', 'ventuno', 'ventitré', 'ventotto', 'trenta', 'cento', 'centotto', 'centottanta', 'novecentonovantanove'])
    expect([3, 21, 40, 105, 300].map(n => numberWords(n, 'en'))).toEqual(['three', 'twenty-one', 'forty', 'one hundred and five', 'three hundred'])
  })

  it('follows the project numbering', () => {
    expect(chapterNumberText(3, undefined, 'it')).toBe('3')
    expect(chapterNumberText(3, 'roman', 'it')).toBe('III')
    expect(chapterNumberText(3, 'words', 'en')).toBe('three')
    expect(chapterNumberText(3, 'none', 'it')).toBe('')
  })
})

// ---------------------------------------------------------------- parts on and off (spec 7.15)

const at = (n: number) => new Date(Date.UTC(2026, 9, 18, 10, 0, n))
const part = (id: string, position: number, deletedAt: Date | null = null) => ({ id, position, createdAt: at(0), deletedAt })
const chapter = (id: string, partId: string | null, position: number, extra: { deletedAt?: Date | null, meta?: Record<string, unknown> } = {}) =>
  ({ id, partId, position, createdAt: at(1), deletedAt: extra.deletedAt ?? null, meta: extra.meta ?? {} })
const P1 = '00000000-0000-4000-8000-000000000001'
const P2 = '00000000-0000-4000-8000-000000000002'
const P3 = '00000000-0000-4000-8000-000000000003'

describe('readingOrder', () => {
  it('puts chapters outside the parts first, then part by part', () => {
    const parts = [part(P2, 1), part(P1, 0)]
    const order = readingOrder([chapter('b', P2, 0), chapter('a2', P1, 1), chapter('loose', null, 5), chapter('a1', P1, 0)], parts)
    expect(order.map(c => c.id)).toEqual(['loose', 'a1', 'a2', 'b'])
  })
})

describe('parts off', () => {
  it('keeps the reading order and remembers each part', () => {
    const changes = planPartsOff([chapter('b', P2, 0), chapter('a', P1, 0)], [part(P1, 0), part(P2, 1)])
    expect(changes).toEqual([
      { id: 'a', partId: null, position: 0, meta: { lastPartId: P1 } },
      { id: 'b', partId: null, position: 1, meta: { lastPartId: P2 } },
    ])
  })

  it('takes trashed chapters out of their part too, unless they left with it', () => {
    const changes = planPartsOff([
      chapter('live', P1, 0),
      // Trashed on its own while its part was alive: restored with parts off, it must not bring back a part.
      chapter('alone', P1, 1, { deletedAt: at(10) }),
      // Trashed with its part (same batch): restoring the part brings it back.
      chapter('withPart', P3, 0, { deletedAt: at(20) }),
      // Trashed before its part was: no batch in common.
      chapter('before', P2, 0, { deletedAt: at(30) }),
    ], [part(P1, 0), part(P2, 1, at(40)), part(P3, 2, at(20))])
    expect(changes.find(c => c.id === 'alone')).toEqual({ id: 'alone', partId: null, meta: { lastPartId: P1 } })
    expect(changes.find(c => c.id === 'before')).toEqual({ id: 'before', partId: null, meta: { lastPartId: P2 } })
    expect(changes.find(c => c.id === 'withPart')).toBeUndefined()
  })
})

describe('parts on', () => {
  it('puts the chapters back into the parts they remember, the others after the chapter before them', () => {
    const ordered = [
      chapter('first', null, 0),
      chapter('a', null, 1, { meta: { lastPartId: P1 } }),
      chapter('new', null, 2),
      chapter('b', null, 3, { meta: { lastPartId: P2 } }),
    ]
    const changes = planPartsOn(ordered, [], [part(P1, 0), part(P2, 1)], new Set([P1, P2]))
    expect(changes.map(c => [c.id, c.partId, c.position])).toEqual([['first', P1, 0], ['a', P1, 1], ['new', P1, 2], ['b', P2, 0]])
    expect(changes.every(c => !('lastPartId' in c.meta))).toBe(true)
  })

  it('gives trashed chapters back their place, so a restore finds it', () => {
    const trashed = [
      // Trashed while parts were off: back to the part it remembers.
      chapter('remembers', null, 4, { deletedAt: at(10), meta: { lastPartId: P2 } }),
      // Its part is gone for good, and it never had another: it follows the chapter before it.
      chapter('orphan', null, 1, { deletedAt: at(11), meta: { lastPartId: P3 } }),
      // Left with its part: untouched, the part's restore brings it back.
      chapter('withPart', P3, 0, { deletedAt: at(12) }),
    ]
    const ordered = [chapter('a', null, 0, { meta: { lastPartId: P1 } }), chapter('b', null, 2, { meta: { lastPartId: P2 } })]
    const changes = planPartsOn(ordered, trashed, [part(P1, 0), part(P2, 1)], new Set([P1, P2]))
    expect(changes.find(c => c.id === 'remembers')).toEqual({ id: 'remembers', partId: P2, meta: {} })
    expect(changes.find(c => c.id === 'orphan')).toEqual({ id: 'orphan', partId: P1, meta: {} })
    expect(changes.find(c => c.id === 'withPart')).toBeUndefined()
  })

  it('opens the first part for chapters that never had one', () => {
    const changes = planPartsOn([chapter('a', null, 0), chapter('b', null, 1)], [], [part(P1, 0)], new Set([P1]))
    expect(changes.map(c => [c.partId, c.position])).toEqual([[P1, 0], [P1, 1]])
  })

  it('off then on gives every chapter back its part and its order', () => {
    const parts = [part(P1, 0), part(P2, 1)]
    const before = [chapter('a1', P1, 0), chapter('a2', P1, 1), chapter('b1', P2, 0), chapter('t', P2, 1, { deletedAt: at(5) })]
    const off = planPartsOff(before, parts)
    const after = before.map((c) => {
      const change = off.find(x => x.id === c.id)!
      return { ...c, partId: change.partId, position: change.position ?? c.position, meta: change.meta }
    })
    const on = planPartsOn(readingOrder(after.filter(c => !c.deletedAt), []), after.filter(c => c.deletedAt), parts, new Set([P1, P2]))
    expect(on.map(c => [c.id, c.partId, c.position ?? 'kept'])).toEqual([['a1', P1, 0], ['a2', P1, 1], ['b1', P2, 0], ['t', P2, 'kept']])
  })
})
