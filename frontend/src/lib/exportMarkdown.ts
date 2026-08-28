import saveAs from 'file-saver'
import TurndownService from 'turndown'
import type { Chapter, CourseProject, Screenshot } from '../types'
import { materializeChapterScreenshots, nativeBridgeCapabilities, screenshotManagedRelativePath } from './nativeBridge'

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

/**
 * 探测本地文件夹桥接是否可用。
 * 只有通过 `npm run dev` 启动（Vite 插件挂载）时才存在；生产静态构建下不可用。
 */
export async function detectNativeBridge() {
  try {
    const result = await nativeBridgeCapabilities()
    return Boolean(result.nativeFolderBridge)
  } catch {
    return false
  }
}

export function buildProjectMarkdown(
  project: CourseProject,
  imageReference: (screenshot: Screenshot, chapterIndex: number, screenshotIndex: number) => string,
) {
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

export interface ExportProjectResult {
  /** 因本地桥接不可用而内嵌到 Markdown 的截图数量 */
  embeddedScreenshots: number
  /** 本地桥接是否可用（false 表示当前为生产静态环境） */
  bridgeAvailable: boolean
}

/**
 * 导出整个课程为单个 Markdown 文件。
 *
 * 优先把截图同步到 `data/managed` 并引用本机 `file:///` 绝对路径（需要 `npm run dev` 桥接）。
 * 桥接不可用或同步失败时，回退为把最新批注截图内嵌为 Base64，保证导出的文件自包含，
 * 并返回 `embeddedScreenshots` 数量供界面提示。
 */
export async function exportProject(project: CourseProject): Promise<ExportProjectResult> {
  const bridgeAvailable = await detectNativeBridge()
  let nativePaths = new Map<string, string>()
  if (bridgeAvailable) {
    try {
      nativePaths = await materializeProjectScreenshots(project)
    } catch {
      // 同步失败时继续使用已有 nativePath 或内嵌回退
    }
  }

  let embeddedScreenshots = 0
  const markdown = buildProjectMarkdown(project, (screenshot, chapterIndex) => {
    const chapter = project.chapters[chapterIndex]
    const relativePath = screenshotManagedRelativePath(screenshot)
    const nativePath = nativePaths.get(`${chapter.id}:${relativePath}`) ?? screenshot.nativePath
    if (nativePath) return nativePathToFileUri(nativePath)
    if (screenshot.dataUrl) {
      embeddedScreenshots += 1
      return screenshot.dataUrl
    }
    throw new Error('截图本地路径不可用且无法内嵌')
  })
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, `${cleanName(project.title) || '学习笔记'}.md`)
  return { embeddedScreenshots, bridgeAvailable }
}
