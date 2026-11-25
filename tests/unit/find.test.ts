import { Schema } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { findMatches, replacedLabel } from '../../app/utils/find'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    mention: { group: 'inline', inline: true, atom: true, attrs: { id: { default: null }, label: { default: null }, followsName: { default: null } } },
  },
})
const p = (...parts: (string | [string, string])[]) => schema.node('paragraph', null, parts.map(part =>
  typeof part === 'string' ? schema.text(part) : schema.node('mention', { id: part[0], label: part[1] })))
const doc = (...paragraphs: ReturnType<typeof p>[]) => schema.node('doc', null, paragraphs)
const query = (text: string, options: { matchCase?: boolean, wholeWord?: boolean } = {}) =>
  ({ text, matchCase: false, wholeWord: false, refId: null, ...options })

// "Anna guarda " (12 characters), the tag, " e Anna ride." in a paragraph that opens at position 0.
const scene = doc(p('Anna guarda ', ['character:anna', 'Anna Rossi'], ' e Anna ride.'))

describe('findMatches', () => {
  it('finds a tag by its name, in reading order with the text', () => {
    expect(findMatches(scene, query('anna'))).toEqual([
      { from: 1, to: 5 },
      { from: 13, to: 14, tag: true },
      { from: 17, to: 21 },
    ])
  })

  it('applies whole word and match case to the name too', () => {
    expect(findMatches(scene, query('Ann', { wholeWord: true }))).toEqual([])
    expect(findMatches(scene, query('Rossi', { wholeWord: true }))).toEqual([{ from: 13, to: 14, tag: true }])
    expect(findMatches(scene, query('rossi', { matchCase: true }))).toEqual([])
  })

  it('never matches across a tag', () => {
    expect(findMatches(scene, query('guarda Anna'))).toEqual([])
  })

  it('finds the mentions of an entity by reference', () => {
    expect(findMatches(scene, { ...query(''), refId: 'character:anna' })).toEqual([{ from: 13, to: 14 }])
  })
})

describe('replacedLabel', () => {
  it('replaces every match in the name, literally', () => {
    expect(replacedLabel('Anna Rossi', query('anna'), 'Hanna')).toBe('Hanna Rossi')
    expect(replacedLabel('Anna Anna', query('Anna'), '$&!')).toBe('$&! $&!')
  })

  it('leaves a blank name when the whole name goes', () => {
    expect(replacedLabel('Anna', query('anna'), '')).toBe('')
  })
})
