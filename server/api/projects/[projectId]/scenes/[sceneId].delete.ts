export default defineEventHandler(event => handleDelete(event, 'scenes', requireUuidParam(event, 'sceneId')))
