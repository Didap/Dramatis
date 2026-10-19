import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { ProjectBundle } from '../../shared/types/entities'

type ProjectRow = typeof tables.projects.$inferSelect

/**
 * Everything the workspace needs, in display order. Trashed items are left out, and so is whatever only
 * makes sense with them (links of a trashed scene, relationships and images of a trashed entity).
 */
export async function loadBundle(project: ProjectRow): Promise<ProjectBundle> {
  const db = useDb()
  const pid = project.id
  const live = (table: any) => and(eq(table.projectId, pid), isNull(table.deletedAt))
  const ordered = (table: any) => [asc(table.position), asc(table.createdAt)]

  const [characters, groups, locations, objects, images, strands, parts, chapters, scenes, links, variables, relations, maps, events, notes, codexCategories, codexEntries] = await Promise.all([
    db.select().from(tables.characters).where(live(tables.characters)).orderBy(...ordered(tables.characters)),
    db.select().from(tables.groups).where(live(tables.groups)).orderBy(...ordered(tables.groups)),
    db.select().from(tables.locations).where(live(tables.locations)).orderBy(...ordered(tables.locations)),
    db.select().from(tables.objects).where(live(tables.objects)).orderBy(...ordered(tables.objects)),
    db.select().from(tables.images).where(live(tables.images)).orderBy(...ordered(tables.images)),
    db.select().from(tables.strands).where(live(tables.strands)).orderBy(...ordered(tables.strands)),
    db.select().from(tables.parts).where(live(tables.parts)).orderBy(...ordered(tables.parts)),
    db.select().from(tables.chapters).where(live(tables.chapters)).orderBy(...ordered(tables.chapters)),
    db.select().from(tables.scenes).where(live(tables.scenes)).orderBy(...ordered(tables.scenes)),
    db.select().from(tables.sceneLinks).where(live(tables.sceneLinks)).orderBy(...ordered(tables.sceneLinks)),
    db.select().from(tables.variables).where(live(tables.variables)).orderBy(...ordered(tables.variables)),
    db.select().from(tables.relations).where(live(tables.relations)).orderBy(asc(tables.relations.createdAt)),
    db.select().from(tables.maps).where(live(tables.maps)).orderBy(...ordered(tables.maps)),
    db.select().from(tables.events).where(live(tables.events)).orderBy(...ordered(tables.events)),
    db.select().from(tables.notes).where(live(tables.notes)).orderBy(...ordered(tables.notes)),
    db.select().from(tables.codexCategories).where(live(tables.codexCategories)).orderBy(...ordered(tables.codexCategories)),
    db.select().from(tables.codexEntries).where(live(tables.codexEntries)).orderBy(...ordered(tables.codexEntries)),
  ])

  const alive = new Set<string>([
    ...characters.map(c => `character:${c.id}`),
    ...groups.map(g => `group:${g.id}`),
    ...locations.map(l => `location:${l.id}`),
    ...objects.map(o => `object:${o.id}`),
    ...codexEntries.map(e => `codex:${e.id}`),
  ])
  const liveScenes = new Set(scenes.map(s => s.id))
  const trash = await db.execute(sql`select
      (select count(*) from characters where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from groups where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from locations where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from objects where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from strands where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from parts where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from chapters where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from scenes where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from scene_links where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from variables where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from relations where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from maps where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from events where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from notes where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from codex_categories where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from codex_entries where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from images where project_id = ${pid} and deleted_at is not null)
    + (select count(*) from scene_revisions where project_id = ${pid} and deleted_at is not null) as n`)
  const trashCount = Number((trash as unknown as { n: string | number }[])[0]?.n ?? 0)

  // JSON serialisation turns Date into ISO strings, which is what ProjectBundle describes.
  return JSON.parse(JSON.stringify({
    project,
    characters,
    groups,
    locations,
    objects,
    images: images.filter(i => alive.has(`${i.ownerType}:${i.ownerId}`)),
    strands,
    parts,
    chapters,
    scenes,
    // A choice whose target is in the trash stays: the flow checks report it ("choice to a trashed scene").
    links: links.filter(l => liveScenes.has(l.fromSceneId)),
    variables,
    relations: relations.filter(r => alive.has(`${r.sourceType}:${r.sourceId}`) && alive.has(`${r.targetType}:${r.targetId}`)),
    maps,
    events,
    notes,
    codexCategories,
    codexEntries,
    trashCount,
  })) as ProjectBundle
}
