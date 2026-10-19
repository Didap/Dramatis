export default defineEventHandler(event => handleUpdate(event, 'scenes', requireUuidParam(event, 'sceneId')))
