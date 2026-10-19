export default defineEventHandler(event => handleDelete(event, collectionParam(event), requireUuidParam(event, 'id')))
