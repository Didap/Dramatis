/**
 * The manuscript for the print page (/print/[projectId]), which the browser turns into the PDF:
 * the same selection and headings as the other formats, each scene as safe XHTML.
 */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const options = parseQuery(event, manuscriptOptionsSchema)
  const ms = buildManuscript(model, options)
  return {
    projectId: model.project.id,
    title: ms.title,
    subtitle: ms.subtitle,
    author: ms.author,
    wordsLabel: ms.wordsLabel,
    words: ms.words,
    sceneCount: ms.sceneCount,
    language: ms.language,
    kind: ms.kind,
    options: ms.options,
    separator: ms.separator,
    parts: ms.parts.map(part => ({
      id: part.id,
      heading: part.heading,
      chapters: part.chapters.map(chapter => ({
        id: chapter.id,
        heading: chapter.heading,
        scenes: chapter.scenes.map(scene => ({
          id: scene.id,
          heading: scene.heading,
          separatorBefore: scene.separatorBefore,
          html: richToHtml(scene.content, { names: ms.names, separator: ms.separator }),
        })),
      })),
    })),
  }
})
