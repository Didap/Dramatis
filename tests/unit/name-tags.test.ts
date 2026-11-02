import { describe, expect, it } from 'vitest'
import { OBJECT, buildNameIndex, endsName, longestPhrase, matchBefore } from '../../app/utils/name-tags'

const index = buildNameIndex([
  { id: 'giovanni', name: 'Giovanni Bubbolo', aliases: ['Giò'] },
  { id: 'mario', name: 'Mario  Bubbolo', aliases: [] },
  { id: 'teresa', name: 'Teresa Ladisa', aliases: ['la scrivana'] },
  { id: 'leonardo', name: 'Leonardo da Vinci', aliases: [] },
  { id: 'ugo', name: 'Ugo', aliases: [] },
])

describe('buildNameIndex', () => {
  it('lists the full name, the capitalised words and the other names', () => {
    expect(index.get('Giovanni Bubbolo')).toEqual(['giovanni'])
    expect(index.get('Giovanni')).toEqual(['giovanni'])
    expect(index.get('Giò')).toEqual(['giovanni'])
    expect(index.get('Mario Bubbolo')).toEqual(['mario'])
    expect(index.get('Ugo')).toEqual(['ugo'])
  })

  it('keeps every character a shared surname belongs to', () => {
    expect(index.get('Bubbolo')).toEqual(['giovanni', 'mario'])
  })

  it('leaves out particles and opens a lowercase other name with a capital', () => {
    expect(index.has('da')).toBe(false)
    expect(index.get('Vinci')).toEqual(['leonardo'])
    expect(index.get('la scrivana')).toEqual(['teresa'])
    expect(index.get('La scrivana')).toEqual(['teresa'])
  })
})

describe('matchBefore', () => {
  it('finds a first name, a surname or a full name at the end of the text', () => {
    expect(matchBefore('Poi Giovanni', index)).toEqual({ start: 4, phrase: 'Giovanni', ids: ['giovanni'] })
    expect(matchBefore('«Vieni, Bubbolo', index)?.ids).toEqual(['giovanni', 'mario'])
    expect(matchBefore('disse Teresa Ladisa', index)).toEqual({ start: 6, phrase: 'Teresa Ladisa', ids: ['teresa'] })
  })

  it('prefers the longest phrase and finds other names of more words', () => {
    expect(matchBefore('Mario Bubbolo', index)?.phrase).toBe('Mario Bubbolo')
    expect(matchBefore('Arrivò la scrivana', index)?.phrase).toBe('la scrivana')
  })

  it('wants the start of a word, after an apostrophe too, never after an @ or a mention', () => {
    expect(matchBefore('Pugo', index)).toBeNull()
    expect(matchBefore('dell’Ugo', index)?.phrase).toBe('Ugo')
    expect(matchBefore('@Ugo', index)).toBeNull()
    expect(matchBefore(`${OBJECT}Ugo`, index)).toBeNull()
  })

  it('is exact about case: a lowercase word is not a name', () => {
    expect(matchBefore('il giovanni', index)).toBeNull()
  })
})

describe('endsName and longestPhrase', () => {
  it('ends a name with spaces and punctuation, not with a hyphen or a letter', () => {
    for (const char of [' ', ',', '.', '»', '”', '!', '?', ';', ':', ')']) expect(endsName(char)).toBe(true)
    for (const char of ['-', 'a', '1']) expect(endsName(char)).toBe(false)
  })

  it('measures the window', () => {
    expect(longestPhrase(index)).toBe('Leonardo da Vinci'.length)
  })
})
