/**
 * The project backup (appendix D.9): "titolo-backup-2026-10-18.dramatis.zip" with the whole project,
 * trash included, and its images. A GET, so any page can offer it as a plain link.
 * `?purpose=copy` (duplicating a project) leaves the export log alone.
 */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event)
  const zip = await buildBackup(model.project.id, model.user.id)
  // "Duplica" reads the backup to import it again: that is no backup the author has.
  if (getQuery(event).purpose !== 'copy') await recordExport(model, 'backup', 'zip')
  const name = `${exportSlug(model.project.title)}-${model.t('export.file.backup')}-${model.day}.dramatis.zip`
  return sendExportFile(event, name, EXPORT_MIME.zip, zip)
})
