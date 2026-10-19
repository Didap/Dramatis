import { describe, expect, it } from 'vitest'
import type { RichDoc } from '../../shared/types/domain'
import {
  countWords,
  docFromParagraphs,
  docWordCount,
  excerpt,
  extractMentions,
  extractSpeakers,
  isEmptyDoc,
  mentionId,
  parseMentionId,
  richToPlainText,
} from '../../shared/utils/richtext'

const scene: RichDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Il mare era fermo. ' }, { type: 'mention', attrs: { id: 'character:11111111-1111-4111-8111-111111111111', label: 'Anna' } }, { type: 'text', text: ' guardava.' }] },
    { type: 'sceneBreak' },
    { type: 'dialogueLine', attrs: { speakerId: '22222222-2222-4222-8222-222222222222', speakerName: 'Marco', direction: 'sottovoce' }, content: [{ type: 'text', text: 'Non tornerà.' }] },
  ],
}

describe('countWords', () => {
  it('counts tokens with letters or digits', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  una  due\ntre ')).toBe(3)
    expect(countWords("l'amico è qui — davvero")).toBe(4)
    expect(countWords('1957, giugno.')).toBe(2)
    expect(countWords('« »')).toBe(0)
  })
})

describe('richToPlainText', () => {
  it('renders mentions, breaks and dialogue lines', () => {
    expect(richToPlainText(scene)).toBe('Il mare era fermo. Anna guardava.\n\n* * *\n\nMARCO: (sottovoce) Non tornerà.')
    expect(richToPlainText(scene, { speakers: false })).toContain('(sottovoce) Non tornerà.')
  })
  it('handles empty input', () => {
    expect(richToPlainText(null)).toBe('')
    expect(isEmptyDoc(docFromParagraphs([]))).toBe(true)
    expect(isEmptyDoc(scene)).toBe(false)
  })
})

describe('word counts of documents', () => {
  it('counts the line text, not speaker nor direction', () => {
    expect(docWordCount(scene)).toBe(6 + 2)
  })
})

describe('mentions', () => {
  it('round-trips ids and extracts unique refs', () => {
    const id = mentionId('location', 'abc')
    expect(parseMentionId(id)).toEqual({ type: 'location', id: 'abc' })
    expect(parseMentionId('nope')).toBeNull()
    expect(parseMentionId('planet:abc')).toBeNull()
    expect(extractMentions(scene)).toEqual([{ type: 'character', id: '11111111-1111-4111-8111-111111111111' }])
    expect(extractSpeakers(scene)).toEqual(['22222222-2222-4222-8222-222222222222'])
  })
})

describe('excerpt', () => {
  it('cuts at a word boundary', () => {
    const doc = docFromParagraphs(['Una frase abbastanza lunga da dover essere tagliata in qualche punto sensato.'])
    expect(excerpt(doc, 30)).toBe('Una frase abbastanza lunga da…')
  })
})
