import type { AppData, Chapter, CourseProject } from '../types'

export interface SearchResultItem {
  projectId: string
  projectTitle: string
  chapterId: string
  chapterTitle: string
  kind: '标题' | '笔记' | '标签' | '截图' | '回顾' | '卡片' | '视频时间'
  snippet: string
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function snippetAround(text: string, index: number, radius = 28) {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + radius + 42)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

function pushMatch(results: SearchResultItem[], project: CourseProject, chapter: Chapter, kind: SearchResultItem['kind'], text: string, needle: string) {
  const index = text.toLocaleLowerCase('zh-CN').indexOf(needle)
  if (index < 0) return
  results.push({
    projectId: project.id,
    projectTitle: project.title,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    kind,
    snippet: snippetAround(text, index),
  })
}

export function searchAll(data: AppData, query: string, limit = 200): SearchResultItem[] {
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  if (!needle) return []

  const results: SearchResultItem[] = []
  for (const project of data.projects) {
    for (const chapter of project.chapters) {
      pushMatch(results, project, chapter, '标题', chapter.title, needle)

      const noteText = stripHtml(chapter.noteHtml)
      pushMatch(results, project, chapter, '笔记', noteText, needle)

      chapter.tags.forEach((tag) => pushMatch(results, project, chapter, '标签', tag, needle))

      chapter.screenshots.forEach((screenshot) => {
        pushMatch(results, project, chapter, '截图', `${screenshot.caption} ${screenshot.name} ${screenshot.timestamp}`.trim(), needle)
      })

      const reflection = [
        chapter.reflection.learned,
        chapter.reflection.unclear,
        chapter.reflection.application,
      ].filter(Boolean).join(' ')
      pushMatch(results, project, chapter, '回顾', reflection, needle)

      chapter.reviewCards.forEach((card) => {
        pushMatch(results, project, chapter, '卡片', `${card.question} ${card.answer}`, needle)
      })

      if (chapter.videoTimestamp) {
        pushMatch(results, project, chapter, '视频时间', chapter.videoTimestamp, needle)
      }

      if (results.length >= limit) return results
    }
  }
  return results
}
