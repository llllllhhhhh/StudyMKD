import saveAs from 'file-saver'
import TurndownService from 'turndown'
import type { Chapter, CourseProject, Screenshot } from '../types'
import { materializeChapterScreenshots, screenshotManagedRelativePath } from './nativeBridge'

const cleanName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').trim()
const cleanLineText = (value: string) => value.replace(/\r?\n/g, ' ').trim()
const escapeAltText = (value: string) => cleanLineText(value).replace(/[\\[\]]/g, '\\$&')

function noteMarkdown(chapter: Chapter) {
  const headingLevel = Math.min(chapter.level + 3, 6)
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
  })

  turndown.addRule('highlight', {
    filter: 'mark',
    replacement: (content) => content.trim() ? `==${content}==` : '',
  })
  turndown.addRule('noteHeading', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: (content) => `\n\n${'#'.repeat(headingLevel)} ${content.trim()}\n\n`,
  })
  turndown.addRule('fencedCodeBlockWithLanguage', {
    filter: (node) => node.nodeName === 'PRE' && node.firstElementChild?.nodeName === 'CODE',
    replacement: (_content, node) => {
      const code = node.firstElementChild as HTMLElement | null
      const language = code?.className.match(/(?:^|\s)language-([\w-]+)/)?.[1] ?? ''
      const text = (code?.textContent ?? '').replace(/\n$/, '')
      const longestBackticks = Math.max(0, ...(text.match(/`+/g) ?? []).map((match) => match.length))
      const fence = '`'.repeat(Math.max(3, longestBackticks + 1))
      return `\n\n${fence}${language}\n${text}\n${fence}\n\n`
    },
  })

  return turndown.turndown(chapter.noteHtml).trim()
}

function nativePathToFileUri(nativePath: string) {
  const normalized = nativePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

export function buildProjectMarkdown(project: CourseProject, imageReference: (screenshot: Screenshot, chapterIndex: number, screenshotIndex: number) => string) {
  const lines: string[] = [`# ${project.title}`, '', '## 章节目录', '']

  project.chapters.forEach((chapter) => {
    lines.push(`${'  '.repeat(Math.max(0, chapter.level - 1))}- ${cleanLineText(chapter.title)}`)
  })

  project.chapters.forEach((chapter, chapterIndex) => {
    const chapterHeadingLevel = Math.min(chapter.level + 1, 6)
    const sectionHeading = '#'.repeat(Math.min(chapter.level + 2, 6))
    lines.push('', `${'#'.repeat(chapterHeadingLevel)} ${cleanLineText(chapter.title)}`, '')

    const notes = noteMarkdown(chapter)
    if (notes) lines.push(`${sectionHeading} 笔记内容`, '', notes)

    if (chapter.screenshots.length) lines.push('', `${sectionHeading} 视频截图`, '')
    chapter.screenshots.forEach((screenshot, screenshotIndex) => {
      const alt = escapeAltText(screenshot.caption || screenshot.name || `视频截图 ${screenshotIndex + 1}`)
      lines.push(`![${alt}](<${imageReference(screenshot, chapterIndex, screenshotIndex)}>)`)
      if (screenshot.timestamp) lines.push('', `**视频位置：** ${cleanLineText(screenshot.timestamp)}`)
      if (screenshot.caption) lines.push('', `**截图说明：** ${cleanLineText(screenshot.caption)}`)
      lines.push('')
    })
  })

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

async function materializeProjectScreenshots(project: CourseProject) {
  const nativePaths = new Map<string, string>()
  for (const chapter of project.chapters) {
    if (!chapter.screenshots.length) continue
    const result = await materializeChapterScreenshots(project, chapter, chapter.screenshots)
    result.files.forEach((file) => nativePaths.set(`${chapter.id}:${file.relativePath}`, file.nativePath))
  }
  return nativePaths
}

export async function exportProject(project: CourseProject) {
  const nativePaths = await materializeProjectScreenshots(project)
  const markdown = buildProjectMarkdown(project, (screenshot, chapterIndex) => {
    const chapter = project.chapters[chapterIndex]
    const relativePath = screenshotManagedRelativePath(screenshot)
    const nativePath = nativePaths.get(`${chapter.id}:${relativePath}`) ?? screenshot.nativePath
    if (!nativePath) throw new Error('截图本地路径不可用')
    return nativePathToFileUri(nativePath)
  })
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, `${cleanName(project.title) || '学习笔记'}.md`)
}
