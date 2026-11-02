/**
 * The names the scene editor recognises while the author writes (VRS-577): every character answers to
 * its full name, to each capitalised word of it (first name, surname) and to its other names. Typed
 * and followed by a space or a punctuation mark, a name becomes a mention without the @; a name shared
 * by more characters (a surname in a family) asks who it is.
 */

export interface NamedCharacter {
  id: string
  name: string
  aliases: readonly string[]
}

/** Each phrase a character answers to, with the characters that answer to it (more than one: homonyms). */
export type NameIndex = Map<string, string[]>

export interface NameMatch {
  /** Offset of the phrase in the text it was found in. */
  start: number
  phrase: string
  ids: string[]
}

const LETTER = /[\p{L}\p{N}]/u
const UPPER = /^\p{Lu}/u
/** Typed right after a name, these end it: spaces and punctuation, not a hyphen (Anna-Maria). */
const ENDS = /^[\s.,;:!?…»”’"')\]}—–]$/u
/** A mention or another inline node in the text the matcher reads: never part of a name. */
export const OBJECT = '￼'

const clean = (value: string) => value.trim().replace(/\s+/g, ' ')
const upperFirst = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1)

export function buildNameIndex(characters: readonly NamedCharacter[]): NameIndex {
  const index: NameIndex = new Map()
  const add = (phrase: string, id: string) => {
    if (!phrase) return
    const ids = index.get(phrase)
    if (!ids) index.set(phrase, [id])
    else if (!ids.includes(id)) ids.push(id)
  }
  for (const character of characters) {
    const name = clean(character.name)
    add(name, character.id)
    // A first name or a surname: a capitalised word of two letters or more ("di", "van" are not names).
    const words = name.split(' ')
    if (words.length > 1) {
      for (const word of words) {
        const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
        if (bare.length >= 2 && UPPER.test(bare)) add(bare, character.id)
      }
    }
    for (const alias of character.aliases) {
      const phrase = clean(alias)
      add(phrase, character.id)
      // "la scrivana" also opens a sentence.
      if (phrase && !UPPER.test(phrase)) add(upperFirst(phrase), character.id)
    }
  }
  return index
}

export const endsName = (char: string) => ENDS.test(char)

/** The longest phrase of the index that ends the text and starts a word. */
export function matchBefore(text: string, index: NameIndex, longest = 120): NameMatch | null {
  for (let start = Math.max(0, text.length - longest); start < text.length; start++) {
    if (!LETTER.test(text[start]!)) continue
    const before = start > 0 ? text[start - 1]! : ''
    if (before && (LETTER.test(before) || before === '@' || before === OBJECT)) continue
    const phrase = text.slice(start)
    const ids = index.get(phrase)
    if (ids) return { start, phrase, ids }
  }
  return null
}

/** The longest phrase of the index, for the matcher's window. */
export function longestPhrase(index: NameIndex): number {
  let longest = 0
  for (const phrase of index.keys()) longest = Math.max(longest, phrase.length)
  return longest
}
