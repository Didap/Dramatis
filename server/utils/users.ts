import type { User } from '../../shared/types/entities'

type UserRow = typeof tables.users.$inferSelect

/** A user row without the password hash, ready for JSON. */
export function toPublicUser(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    timezone: user.timezone,
    preferences: user.preferences,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

/** true for a time zone the runtime knows (Europe/Rome, America/New_York...). */
export function isTimeZone(value: string | undefined): boolean {
  if (!value) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  }
  catch {
    return false
  }
}

/** Today (or the given moment) as YYYY-MM-DD in a time zone. */
export function dayIn(timeZone: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  }
  catch {
    return date.toISOString().slice(0, 10)
  }
}
