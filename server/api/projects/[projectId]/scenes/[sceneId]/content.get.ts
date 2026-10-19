import type { SceneContent } from '../../../../../../shared/types/entities'

export default defineEventHandler(async (event): Promise<SceneContent> => {
  const { project } = await requireProject(event)
  const scene = await requireScene(project.id, requireUuidParam(event, 'sceneId'))
  const revision = await currentRevision(scene)
  return {
    sceneId: scene.id,
    revisionId: revision.id,
    content: revision.content,
    wordCount: revision.wordCount,
    charCount: revision.charCount,
    charCountNoSpaces: revision.charCountNoSpaces,
    version: revision.version,
    updatedAt: revision.updatedAt.toISOString(),
  }
})
