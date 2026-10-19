import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

/*
 * The spell check of the editor: Hunspell (WebAssembly) with the dictionaries in public/dictionaries,
 * loaded the first time a scene in that language is opened. Words of the project are never errors:
 * the project's dictionary ("Aggiungi al dizionario") and the names of its characters, races,
 * groups, places, objects and codex entries.
 */

/** Languages with a dictionary in public/dictionaries. */
export const SPELL_LANGUAGES = ['it', 'en'] as const
export type SpellLanguage = typeof SPELL_LANGUAGES[number]

/** The dictionary for a work's language (BCP 47), or null when there is none. */
export function spellLanguage(tag: string | null | undefined): SpellLanguage | null {
  const base = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return (SPELL_LANGUAGES as readonly string[]).includes(base) ? base as SpellLanguage : null
}

export interface Speller {
  correct: (word: string) => boolean
  suggest: (word: string) => string[]
}

let factory: Promise<import('hunspell-asm').HunspellFactory> | null = null
const spellers = new Map<SpellLanguage, Promise<Speller>>()

async function bytes(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/** The speller of a language, loaded once per page (about 1.4 MB for Italian, cached by the browser). */
export function loadSpeller(lang: SpellLanguage): Promise<Speller> {
  let pending = spellers.get(lang)
  if (!pending) {
    pending = (async () => {
      // The CommonJS build: the ES one imports its WebAssembly runtime as a namespace, which the
      // bundler hands over as an object instead of the function it expects.
      factory ??= import('hunspell-asm/dist/cjs/index.js').then(m => m.loadModule())
      const [hunspellFactory, aff, dic] = await Promise.all([factory, bytes(`/dictionaries/${lang}.aff`), bytes(`/dictionaries/${lang}.dic`)])
      const hunspell = hunspellFactory.create(hunspellFactory.mountBuffer(aff, `${lang}.aff`), hunspellFactory.mountBuffer(dic, `${lang}.dic`))
      const known = new Map<string, boolean>()
      return {
        correct(word: string) {
          let ok = known.get(word)
          if (ok === undefined) {
            ok = hunspell.spell(word)
            known.set(word, ok)
          }
          return ok
        },
        suggest: (word: string) => hunspell.suggest(word),
      }
    })()
    pending.catch(() => {
      spellers.delete(lang)
      factory = null
    })
    spellers.set(lang, pending)
  }
  return pending
}

// ------------------------------------------------------------------ words

/** A word: letters with apostrophes inside (dell'acqua) and at the end (po'). */
const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*['’]?/gu

/** The project's words, lower case and with the straight apostrophe, as `isAccepted` compares them. */
export function spellWordKey(word: string): string {
  return word.replace(/’/g, '\'').toLocaleLowerCase()
}

/** Every word of the names of the project's entities, ready for the accepted set. */
export function namesToWords(names: readonly string[]): string[] {
  const words: string[] = []
  for (const name of names) for (const match of name.matchAll(WORD)) words.push(spellWordKey(match[0]))
  return words
}

/** Acronyms (ONU, NASA), mixed case (iPhone) and single letters are not checked (e' is: it should be è). */
function checkable(word: string): boolean {
  const letters = word.replace(/['’]/g, '')
  if (letters.length < 2 && !/['’]$/.test(word)) return false
  if (letters === letters.toLocaleUpperCase() && letters.length <= 5) return false
  return !/\p{Lu}/u.test(letters.slice(1)) || letters === letters.toLocaleUpperCase()
}

export interface SpellChecker {
  speller: Speller
  /** The project's words and the ones ignored in this session (spellWordKey). */
  accepted: ReadonlySet<string>
}

/** Whether a word of the text is spelled right, by the dictionary or by the project. */
export function isSpelledRight(word: string, checker: SpellChecker): boolean {
  const plain = word.replace(/’/g, '\'')
  const { speller, accepted } = checker
  const ok = (w: string) => !!w && (accepted.has(w.toLocaleLowerCase()) || speller.correct(w))
  if (ok(plain)) return true
  // A closing quote at the end: «lui disse 'basta'». Not for one letter: e' is a mistake for è.
  if (plain.endsWith('\'') && plain.length > 2 && ok(plain.slice(0, -1))) return true
  // English possessive of a word of the project: Uklar's.
  if (/'s$/i.test(plain) && accepted.has(plain.slice(0, -2).toLocaleLowerCase())) return true
  // An elided article or preposition before a word of the project: dell'Uklar, l'uklaro.
  const apostrophe = plain.indexOf('\'')
  if (apostrophe > 0 && apostrophe <= 5 && apostrophe < plain.length - 1) {
    const tail = plain.slice(apostrophe + 1)
    if (accepted.has(tail.toLocaleLowerCase())) return true
  }
  return false
}

export interface SpellError {
  from: number
  to: number
  word: string
}

/**
 * The misspelled words of a document. Mentions, speakers and code are not text; a word next to a
 * digit, or in an address (@ / \ _), is not a word. `skipAt`: the word the caret ends, still being typed.
 */
export function findSpellErrors(doc: PMNode, checker: SpellChecker, skipAt: number | null = null): { errors: SpellError[], skipped: { from: number, to: number } | null } {
  const errors: SpellError[] = []
  let skipped: { from: number, to: number } | null = null
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    node.forEach((child) => {
      const code = child.marks.some(m => m.type.name === 'code')
      text += child.isText && !code ? child.text! : '￼'.repeat(child.nodeSize)
    })
    for (const match of text.matchAll(WORD)) {
      const word = match[0]
      const start = match.index!
      const before = text[start - 1] ?? ''
      const after = text[start + word.length] ?? ''
      if (/[\p{N}@/\\_]/u.test(before) || /[\p{N}@/\\_]/u.test(after)) continue
      if ((before === '.' && /\p{L}/u.test(text[start - 2] ?? '')) || (after === '.' && /\p{L}/u.test(text[start + word.length + 1] ?? ''))) continue
      if (!checkable(word) || isSpelledRight(word, checker)) continue
      const from = pos + 1 + start
      const to = from + word.length
      if (skipAt !== null && to === skipAt) {
        skipped = { from, to }
        continue
      }
      errors.push({ from, to, word })
    }
    return false
  })
  return { errors, skipped }
}

/** The suggestions for a word, written with the text's own apostrophe. */
export function spellSuggestions(word: string, speller: Speller, limit = 5): string[] {
  const curly = word.includes('’')
  return speller.suggest(word.replace(/’/g, '\''))
    .slice(0, limit)
    .map(s => (curly ? s.replace(/'/g, '’') : s))
}

// ------------------------------------------------------------------ the editor extension

export interface SpellState {
  errors: SpellError[]
  /** The error the spelling panel is on (index in `errors`), -1 for none. */
  current: number
  /** The word left out because the caret was at its end. */
  skipped: { from: number, to: number } | null
  decorations: DecorationSet
}

type SpellMeta = { refresh: true, typing?: boolean } | { current: number }

export const spellPluginKey = new PluginKey<SpellState>('spelling')
const EMPTY: SpellState = { errors: [], current: -1, skipped: null, decorations: DecorationSet.empty }

function decorate(doc: PMNode, errors: SpellError[], current: number) {
  return DecorationSet.create(doc, errors.map((e, i) => Decoration.inline(e.from, e.to, {
    'class': i === current ? 'd-spell-error is-current' : 'd-spell-error',
    'data-spell-error': '',
  })))
}

export interface SpellingOptions {
  /** The checker of the moment: null while the dictionary loads, or with the spell check off. */
  checker: () => SpellChecker | null
  /** A misspelled word was clicked or tapped: its element, for the suggestions menu. */
  onPick: (error: SpellError, anchor: HTMLElement) => void
}

/** Waits for a pause in the typing before checking again. */
const PAUSE = 350

export const Spelling = Extension.create<SpellingOptions>({
  name: 'spelling',
  addOptions() {
    return { checker: () => null, onPick: () => {} }
  },
  addProseMirrorPlugins() {
    const options = this.options
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = (view: EditorView, typing: boolean) => {
      if (timer) clearTimeout(timer)
      timer = null
      if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(spellPluginKey, { refresh: true, typing }))
    }
    return [new Plugin<SpellState>({
      key: spellPluginKey,
      state: {
        init: () => EMPTY,
        apply(tr, prev, _old, state: EditorState) {
          const meta = tr.getMeta(spellPluginKey) as SpellMeta | undefined
          if (meta && 'current' in meta) {
            const current = meta.current < prev.errors.length ? meta.current : -1
            return { ...prev, current, decorations: decorate(tr.doc, prev.errors, current) }
          }
          if (meta && 'refresh' in meta) {
            const checker = options.checker()
            if (!checker) return EMPTY
            const caret = meta.typing && state.selection.empty ? state.selection.head : null
            const { errors, skipped } = findSpellErrors(tr.doc, checker, caret)
            const current = Math.min(prev.current, errors.length - 1)
            return { errors, current, skipped, decorations: decorate(tr.doc, errors, current) }
          }
          if (!tr.docChanged) return prev
          // Until the next check, the marks follow the text.
          const errors = prev.errors
            .map(e => ({ ...e, from: tr.mapping.map(e.from, 1), to: tr.mapping.map(e.to, -1) }))
            .filter(e => e.to > e.from)
          return { ...prev, errors, decorations: prev.decorations.map(tr.mapping, tr.doc) }
        },
      },
      view(view) {
        // The first check, as soon as the editor is there.
        setTimeout(() => refresh(view, false))
        return {
          update(view, previous) {
            if (view.state.doc !== previous.doc) {
              if (timer) clearTimeout(timer)
              timer = setTimeout(() => refresh(view, true), PAUSE)
              return
            }
            // The caret has left the word it was ending: check it now.
            const skipped = spellPluginKey.getState(view.state)?.skipped
            if (skipped && !timer && view.state.selection.head !== skipped.to) refresh(view, false)
          },
          destroy() {
            if (timer) clearTimeout(timer)
          },
        }
      },
      props: {
        decorations: state => spellPluginKey.getState(state)?.decorations,
        handleClick(view, pos, event) {
          const anchor = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-spell-error]')
          if (!anchor) return false
          const error = spellPluginKey.getState(view.state)?.errors.find(e => e.from <= pos && pos <= e.to)
          if (error) options.onPick(error, anchor)
          return false
        },
      },
    })]
  },
})

export function spellState(editor: Editor): SpellState {
  return spellPluginKey.getState(editor.state) ?? EMPTY
}

/** Checks the whole text again (the dictionary has loaded, a word was added or ignored). */
export function refreshSpelling(editor: Editor) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(spellPluginKey, { refresh: true }))
}

/** Marks the error the spelling panel is on. */
export function setSpellCurrent(editor: Editor, current: number) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(spellPluginKey, { current }))
}

/** Writes `text` over a misspelled word, keeping its marks. False when the text there has changed. */
export function replaceSpellError(editor: Editor, error: SpellError, text: string): boolean {
  const { state } = editor
  if (error.to > state.doc.content.size || state.doc.textBetween(error.from, error.to) !== error.word) return false
  editor.view.dispatch(state.tr.insertText(text, error.from, error.to))
  return true
}
