import { describe, expect, it } from 'vitest'
import { compareStoryTime, parseStoryTime, storyTimeKey } from '../../shared/utils/time'
import { resolveModules } from '../../shared/utils/modules'

describe('story time', () => {
  it('parses every precision', () => {
    expect(parseStoryTime('1957')).toEqual({ year: 1957 })
    expect(parseStoryTime('1957-06-12T08:30')).toEqual({ year: 1957, month: 6, day: 12, hour: 8, minute: 30 })
    expect(parseStoryTime('-300')).toEqual({ year: -300 })
    expect(parseStoryTime('giugno')).toBeNull()
  })
  it('sorts chronologically across precisions and eras', () => {
    const values = ['1957-06-12T08:30', '1957', '-300', '1957-06-12', '1943-09-08', null, '1957-06-12T07:00']
    const sorted = [...values].sort(compareStoryTime)
    expect(sorted).toEqual(['-300', '1943-09-08', '1957', '1957-06-12', '1957-06-12T07:00', '1957-06-12T08:30', null])
    expect(storyTimeKey('1957')! < storyTimeKey('1957-01-01')!).toBe(true)
  })
})

describe('modules', () => {
  it('defaults by kind, explicit choices win', () => {
    expect(resolveModules('novel', {}).branching).toBe(false)
    expect(resolveModules('game', {}).branching).toBe(true)
    expect(resolveModules('novel', { branching: true }).branching).toBe(true)
    expect(resolveModules('game', { codex: false }).codex).toBe(false)
  })
})
