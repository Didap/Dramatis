import { readFileSync } from 'node:fs'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { loadModule } from 'hunspell-asm'
import { beforeAll, describe, expect, it } from 'vitest'
import { findSpellErrors, isSpelledRight, namesToWords, spellLanguage, spellSuggestions, type SpellChecker, type Speller } from '../../app/utils/spelling'

const schema = getSchema([StarterKit])

async function speller(lang: 'it' | 'en'): Promise<Speller> {
  const factory = await loadModule()
  const read = (ext: string) => new Uint8Array(readFileSync(new URL(`../../public/dictionaries/${lang}.${ext}`, import.meta.url)))
  const hunspell = factory.create(factory.mountBuffer(read('aff'), `${lang}.aff`), factory.mountBuffer(read('dic'), `${lang}.dic`))
  return { correct: w => hunspell.spell(w), suggest: w => hunspell.suggest(w) }
}

const paragraph = (text: string) => schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const words = (text: string, checker: SpellChecker) => findSpellErrors(paragraph(text), checker).errors.map(e => e.word)

let it_: Speller
let en: Speller
beforeAll(async () => {
  it_ = await speller('it')
  en = await speller('en')
})

describe('spell check', () => {
  it('knows which languages have a dictionary', () => {
    expect(spellLanguage('it')).toBe('it')
    expect(spellLanguage('en-GB')).toBe('en')
    expect(spellLanguage('fr')).toBeNull()
  })

  it('flags an invented word until the project knows it', () => {
    const text = 'Il regno di Uklar era presieduto dagli uklari.'
    expect(words(text, { speller: it_, accepted: new Set() })).toEqual(['Uklar', 'uklari'])
    expect(words(text, { speller: it_, accepted: new Set(['uklari', ...namesToWords(['Regno di Uklar'])]) })).toEqual([])
  })

  it('reads Italian elisions with either apostrophe, and catches the wrong ones', () => {
    const checker = { speller: it_, accepted: new Set(['uklar']) }
    expect(words('Dell’acqua, l\'invito, un po\' d’estate, c’era dell’Uklar.', checker)).toEqual([])
    expect(words('Qual\'è il problema? Perche e\' tardi.', checker)).toEqual(['Qual\'è', 'Perche', 'e\''])
  })

  it('leaves out acronyms, numbers and addresses', () => {
    const checker = { speller: it_, accepted: new Set<string>() }
    expect(words('La NATO, il 3D, scrivi a nome@posta.it o www.sitoweb.com', checker)).toEqual([])
  })

  it('leaves out the word still being typed', () => {
    const doc = paragraph('Scrivo qualcsa')
    const end = doc.content.size - 1
    const { errors, skipped } = findSpellErrors(doc, { speller: it_, accepted: new Set() }, end)
    expect(errors).toEqual([])
    expect(skipped).not.toBeNull()
  })

  it('suggests corrections with the text\'s apostrophe', () => {
    expect(spellSuggestions('cammminava', it_)[0]).toBe('camminava')
    expect(spellSuggestions('recieve', en)[0]).toBe('receive')
    expect(isSpelledRight('Uklar\'s', { speller: en, accepted: new Set(['uklar']) })).toBe(true)
  })
})
