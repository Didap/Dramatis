/** Parts of an in-story time: '1957', '1957-06', '1957-06-12', '1957-06-12T08:30', negative years allowed. */
export interface StoryTimeParts {
  year: number
  month?: number
  day?: number
  hour?: number
  minute?: number
}

const STORY_TIME_RE = /^(-?\d{1,6})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?$/

export function parseStoryTime(value: string | null | undefined): StoryTimeParts | null {
  if (!value) return null
  const m = STORY_TIME_RE.exec(value.trim())
  if (!m) return null
  const parts: StoryTimeParts = { year: Number(m[1]) }
  if (m[2]) parts.month = Number(m[2])
  if (m[3]) parts.day = Number(m[3])
  if (m[4]) parts.hour = Number(m[4])
  if (m[5]) parts.minute = Number(m[5])
  return parts
}

/**
 * A number that sorts story times chronologically, whatever their precision
 * (a year sorts before the dates inside it). null when the value is not a story time.
 */
export function storyTimeKey(value: string | null | undefined): number | null {
  const p = parseStoryTime(value)
  if (!p) return null
  return (((p.year * 13 + (p.month ?? 0)) * 32 + (p.day ?? 0)) * 25 + (p.hour ?? -1) + 1) * 60 + (p.minute ?? 0)
}

/** Compares two story times; values without a time go last. */
export function compareStoryTime(a: string | null | undefined, b: string | null | undefined): number {
  const ka = storyTimeKey(a)
  const kb = storyTimeKey(b)
  if (ka === null && kb === null) return 0
  if (ka === null) return 1
  if (kb === null) return -1
  return ka - kb
}
