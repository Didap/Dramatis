import type { H3Event } from 'h3'
import { unzipSync } from 'fflate'
import type { z } from 'zod'

/*
 * What an upload may cost the server. An export or an import runs in the one process every author shares, so
 * nothing in a request decides on its own how much memory it takes: the body is weighed before it is read,
 * every entry of an archive before it is unpacked, and imports of one author wait for each other.
 */

/** A 413 with the reason the import and export pages show ("tooLarge"). */
export function exportTooLarge(message = 'The file is too large'): never {
  throw createError({ statusCode: 413, message, data: { reason: 'tooLarge' } })
}

/**
 * Keeps a request body within `max` bytes. A declared length above it is refused (413) before a byte is read.
 * A body sent without a length (in chunks, as some proxies forward uploads) is counted as it arrives, and the
 * request is cut off once it passes the limit. Call it right before the body is read, in the same tick: the
 * counter listens to the same stream as the reader.
 */
export function exportBodyLimit(event: H3Event, max: number): { exceeded: boolean } {
  const declared = getRequestHeader(event, 'content-length')
  if (declared !== undefined) {
    if (!/^\d+$/.test(declared.trim()) || Number(declared) > max) exportTooLarge()
    return { exceeded: false }
  }
  const state = { exceeded: false }
  const request = event.node?.req
  if (!request || typeof request.on !== 'function') return state
  let received = 0
  const count = (chunk: Buffer) => {
    received += chunk.length
    if (received <= max) return
    state.exceeded = true
    request.off('data', count)
    request.destroy(new Error('The request body is too large'))
  }
  request.on('data', count)
  request.once('end', () => request.off('data', count))
  return state
}

/** Reads and validates a JSON body (parseBody) of at most `max` bytes; a larger one answers 413. */
export async function exportParseBody<T extends z.ZodType>(event: H3Event, schema: T, max: number): Promise<z.output<T>> {
  const limit = exportBodyLimit(event, max)
  try {
    const body = await parseBody(event, schema)
    if (limit.exceeded) exportTooLarge()
    return body
  }
  catch (error) {
    if (limit.exceeded) exportTooLarge()
    throw error
  }
}

/** Deflate cannot make data more than 1032 times larger (a 258-byte match costs at least two bits). */
const MAX_DEFLATE_RATIO = 1032

export interface ExportUnzipLimits {
  /** The largest size an entry may unpack to, or null to leave the entry out. */
  entry: (name: string) => number | null
  /** The largest size of all the entries kept, together. */
  total: number
}

/**
 * Unpacks the entries of an archive that `limits.entry` accepts. fflate allocates each entry at the size the
 * archive declares, so a few hundred bytes could claim gigabytes: a size above its limit answers 413, and a
 * size that deflate cannot reach from the bytes really there marks the archive as damaged (400 invalid).
 * Errors of a malformed archive come from fflate as they are.
 */
export function exportUnzip(data: Uint8Array, limits: ExportUnzipLimits): Record<string, Uint8Array> {
  let total = 0
  return unzipSync(data, {
    filter: (file) => {
      const max = limits.entry(file.name)
      if (max === null) return false
      const size = file.originalSize
      const possible = file.compression === 0 ? size === file.size : file.compression === 8 && size <= file.size * MAX_DEFLATE_RATIO + 1024
      if (!possible) throw createError({ statusCode: 400, message: 'The archive is damaged', data: { reason: 'invalid' } })
      total += size
      if (size > max || total > limits.total) exportTooLarge()
      return true
    },
  })
}

/** The names of an archive's entries, read from its directory without unpacking anything. */
export function exportZipNames(data: Uint8Array, max = 50_000): string[] {
  const names: string[] = []
  unzipSync(data, {
    filter: (file) => {
      if (names.length >= max) throw createError({ statusCode: 400, message: 'The archive has too many entries', data: { reason: 'invalid' } })
      names.push(file.name)
      return false
    },
  })
  return names
}

const queues = new Map<string, { tail: Promise<void>, size: number }>()

/**
 * Runs `task` once the earlier tasks of the same key are done: one import at a time for each author, the
 * next one waiting (its upload not read yet). With `max` tasks already running or waiting, answers 429
 * with the reason "busy".
 */
export async function exportOneAtATime<T>(key: string, max: number, task: () => Promise<T>): Promise<T> {
  const queue = queues.get(key) ?? { tail: Promise.resolve(), size: 0 }
  if (queue.size >= max) throw createError({ statusCode: 429, message: 'Another import is still running', data: { reason: 'busy' } })
  queue.size++
  queues.set(key, queue)
  const result = queue.tail.then(task)
  queue.tail = result.then(() => undefined, () => undefined)
  try {
    return await result
  }
  finally {
    if (--queue.size === 0) queues.delete(key)
  }
}
