import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as tables from '../db/schema'

export { tables }

type Db = ReturnType<typeof createDb>

let instance: Db | null = null

function createDb(url: string) {
  const client = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 })
  return drizzle(client, { schema: tables })
}

/** The shared Drizzle client. */
export function useDb(): Db {
  if (!instance) {
    const url = useRuntimeConfig().databaseUrl || process.env.DATABASE_URL
    if (!url) throw createError({ statusCode: 500, message: 'DATABASE_URL is not configured' })
    instance = createDb(url)
  }
  return instance
}

/** A transaction handle or the client itself: helpers accept both. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]
