import type { Chapter } from '../types'

const titleKey = (chapter: Pick<Chapter, 'level' | 'title'>) => `${chapter.level}:${chapter.title
  .toLocaleLowerCase('zh-CN')
  .replace(/[\s·•:：.。、，,_-]+/g, '')}`

export function isBlankPlaceholder(chapters: Chapter[]) {
  if (chapters.length !== 1) return false
  const [chapter] = chapters
  return chapter.title === '开始学习'
    && !chapter.noteHtml
    && !chapter.videoTimestamp
    && !chapter.tags.length
    && !chapter.flags.length
    && !chapter.screenshots.length
    && !chapter.reviewCards.length
    && !(chapter.attachments?.length)
    && !chapter.reflection.learned
    && !chapter.reflection.unclear
    && !chapter.reflection.application
}

export function getNewCatalogChapters(existing: Chapter[], incoming: Chapter[]) {
  if (isBlankPlaceholder(existing)) return incoming
  const existingKeys = new Set(existing.map(titleKey))
  return incoming.filter((chapter) => !existingKeys.has(titleKey(chapter)))
}

export function mergeCatalogChapters(existing: Chapter[], incoming: Chapter[]) {
  if (isBlankPlaceholder(existing)) {
    return { chapters: incoming, added: incoming }
  }

  const chapters = [...existing]
  const added: Chapter[] = []
  let cursor = -1

  incoming.forEach((chapter) => {
    const key = titleKey(chapter)
    const existingIndex = chapters.findIndex((item) => titleKey(item) === key)
    if (existingIndex >= 0) {
      cursor = existingIndex
      return
    }

    const insertionIndex = cursor >= 0 ? cursor + 1 : chapters.length
    chapters.splice(insertionIndex, 0, chapter)
    added.push(chapter)
    cursor = insertionIndex
  })

  return { chapters, added }
}

export function removeChapterFromList(chapters: Chapter[], chapterId: string) {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index < 0) return { chapters, activeChapterId: '' }

  const remaining = chapters.filter((chapter) => chapter.id !== chapterId)
  const nextActive = remaining[index - 1] ?? remaining[index]
  return { chapters: remaining, activeChapterId: nextActive?.id ?? '' }
}
