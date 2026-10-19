export default defineEventHandler(event => handleUpdate(event, collectionParam(event), requireUuidParam(event, 'id')))
