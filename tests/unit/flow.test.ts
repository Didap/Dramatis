import { describe, expect, it } from 'vitest'
import { analyseFlow, variableUsage } from '../../shared/utils/flow'

const s = (id: string, ending = false) => ({ id, ending })

describe('analyseFlow', () => {
  it('follows the implicit continuation of scenes without choices', () => {
    const flow = analyseFlow([s('a'), s('b'), s('c', true)], [], 'a')
    expect(flow.edges.map(e => `${e.from}>${e.to}`)).toEqual(['a>b', 'b>c'])
    expect(flow.unreachable).toEqual([])
    expect(flow.deadEnds).toEqual([])
    expect(flow.problems).toBe(0)
  })

  it('choices replace the continuation and can leave scenes unreachable', () => {
    const scenes = [s('a'), s('b'), s('c'), s('d', true), s('e', true)]
    const links = [
      { id: 'l1', fromSceneId: 'a', toSceneId: 'c' },
      { id: 'l2', fromSceneId: 'a', toSceneId: 'd' },
    ]
    const flow = analyseFlow(scenes, links, 'a')
    // b is skipped by the choices of a; c continues to d (next in order); e cannot be reached.
    expect(flow.unreachable).toEqual(['b', 'e'])
    expect(flow.unreachableEndings).toEqual(['e'])
    expect(flow.edges.some(e => e.from === 'a' && e.to === 'b')).toBe(false)
  })

  it('has no problems without scenes, and counts dead ends only among reachable scenes', () => {
    expect(analyseFlow([], [], null).problems).toBe(0)
    const flow = analyseFlow([s('a', true), s('b')], [], 'a')
    expect(flow.unreachable).toEqual(['b'])
    expect(flow.deadEnds).toEqual([])
  })

  it('a scene whose only choice points to a scene that is gone has no implicit continuation', () => {
    const flow = analyseFlow([s('a'), s('b', true)], [{ id: 'x', fromSceneId: 'a', toSceneId: 'gone' }], 'a')
    expect(flow.edges).toEqual([])
    expect(flow.unreachable).toEqual(['b'])
    expect(flow.deadEnds).toEqual(['a'])
    expect(flow.brokenLinks).toEqual(['x'])
  })

  it('reports dead ends, broken links, missing start and endings', () => {
    const flow = analyseFlow([s('a'), s('b')], [{ id: 'x', fromSceneId: 'a', toSceneId: 'gone' }], null)
    expect(flow.brokenLinks).toEqual(['x'])
    // a's only choice is broken, so a leads nowhere too.
    expect(flow.deadEnds).toEqual(['a', 'b'])
    expect(flow.hasStart).toBe(false)
    expect(flow.problems).toBe(1 + 2 + 1 + 1)
  })

  it('counts variable usage', () => {
    const usage = variableUsage([{ id: 'l', fromSceneId: 'a', toSceneId: 'b', conditions: { clauses: [{ variableId: 'v1' }] }, effects: [{ variableId: 'v2' }, { variableId: 'v1' }] }])
    expect(usage.read.get('v1')).toBe(1)
    expect(usage.written.get('v1')).toBe(1)
    expect(usage.written.get('v2')).toBe(1)
  })
})
