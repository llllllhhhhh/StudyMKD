import saveAs from 'file-saver'
import TurndownService from 'turndown'
import type { Chapter, CourseProject } from '../types'

const cleanName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').trim()
const cleanLineText = (value: string) => value.replace(/\r?\n/g, ' ').trim()

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

export function buildProjectMarkdown(project: CourseProject) {
  const lines: string[] = [`# ${project.title}`, '', '## 章节目录', '']

  project.chapters.forEach((chapter) => {
    lines.push(`${'  '.repeat(Math.max(0, chapter.level - 1))}- ${cleanLineText(chapter.title)}`)
  })

  project.chapters.forEach((chapter) => {
    const chapterHeadingLevel = Math.min(chapter.level + 1, 6)
    const sectionHeading = '#'.repeat(Math.min(chapter.level + 2, 6))
    lines.push('', `${'#'.repeat(chapterHeadingLevel)} ${cleanLineText(chapter.title)}`, '')

    const notes = noteMarkdown(chapter)
    if (notes) lines.push(`${sectionHeading} 笔记内容`, '', notes)
  })

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

export function exportProject(project: CourseProject) {
  const markdown = buildProjectMarkdown(project)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, `${cleanName(project.title) || '学习笔记'}.md`)
}
