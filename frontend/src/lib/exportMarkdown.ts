import JSZip from 'jszip'
import saveAs from 'file-saver'
import TurndownService from 'turndown'
import type { ChapterAttachment, CourseProject, Screenshot } from '../types'
import { attachmentBytes, parseDataUrl, safeArchivePath } from './fileUtils'
import { formatStudyDuration, getStudyElapsedSeconds } from './studyTimer'

const flagLabels = {
  key: '重点',
  question: '有疑问',
  review: '待复习',
  practice: '可实践',
  mastered: '已掌握',
} as const

const cleanName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').trim()
const slug = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
const escapeAlt = (value: string) => value.replace(/[\[\]\\]/g, '\\$&').replace(/\r?\n/g, ' ')

function imageExtension(mime: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return extensions[mime] ?? 'png'
}

function assetName(chapterIndex: number, screenshotIndex: number, screenshot: Screenshot) {
  const { mime } = parseDataUrl(screenshot.dataUrl)
  return `chapter-${String(chapterIndex + 1).padStart(3, '0')}-image-${String(screenshotIndex + 1).padStart(3, '0')}.${imageExtension(mime)}`
}

type ImageReference = (screenshot: Screenshot, chapterIndex: number, screenshotIndex: number) => string
type AttachmentReference = (attachment: ChapterAttachment, chapterIndex: number) => string

export function buildProjectMarkdown(project: CourseProject, imageReference: ImageReference, attachmentReference: AttachmentReference = (attachment) => attachment.relativePath) {
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })
  turndown.keep(['mark'])
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
  const lines: string[] = [`# ${project.title}`, '', '## 目录', '']

  project.chapters.forEach((chapter) => {
    lines.push(`${'  '.repeat(chapter.level - 1)}- [${chapter.title}](#${slug(chapter.title)})`)
  })

  project.chapters.forEach((chapter, chapterIndex) => {
    lines.push('', `${'#'.repeat(Math.min(chapter.level + 1, 6))} ${chapter.title}`, '')
    lines.push(`**学习状态：** ${{ not_started: '未开始', learning: '学习中', completed: '已完成' }[chapter.status]}  `)
    lines.push(`**计划用时：** ${chapter.studyPlanMinutes} 分钟  `)
    if (getStudyElapsedSeconds(chapter) > 0) lines.push(`**实际用时：** ${formatStudyDuration(getStudyElapsedSeconds(chapter))}  `)
    if (chapter.flags.length) lines.push(`**内容标记：** ${chapter.flags.map((flag) => flagLabels[flag]).join('、')}  `)
    if (chapter.videoTimestamp) lines.push(`**视频时间：** ${chapter.videoTimestamp}  `)
    if (chapter.tags.length) lines.push(`**标签：** ${chapter.tags.join('、')}  `)
    if (chapter.noteHtml) lines.push('', '#### 学习笔记', '', turndown.turndown(chapter.noteHtml))

    if (chapter.screenshots.length) lines.push('', '#### 视频截图', '')
    chapter.screenshots.forEach((screenshot, screenshotIndex) => {
      const alt = escapeAlt(screenshot.caption || screenshot.name || `截图 ${screenshotIndex + 1}`)
      lines.push(`![${alt}](${imageReference(screenshot, chapterIndex, screenshotIndex)})`)
      if (screenshot.timestamp) lines.push(`> 视频位置：${screenshot.timestamp}`)
      if (screenshot.caption) lines.push(`> ${screenshot.caption}`)
      lines.push('')
    })

    if (chapter.attachments?.length) lines.push('', '#### 章节文件', '')
    chapter.attachments?.forEach((attachment) => {
      lines.push(`- [${escapeAlt(attachment.name)}](<${attachmentReference(attachment, chapterIndex)}>)`)
    })

    const reflection = chapter.reflection
    if (reflection.learned || reflection.unclear || reflection.application) {
      lines.push('', '#### 章节回顾', '')
      if (reflection.learned) lines.push(`- 学到了：${reflection.learned}`)
      if (reflection.unclear) lines.push(`- 仍有疑问：${reflection.unclear}`)
      if (reflection.application) lines.push(`- 实际应用：${reflection.application}`)
    }

    if (chapter.reviewCards.length) {
      lines.push('', '#### 复习卡片', '')
      chapter.reviewCards.forEach((card) => {
        lines.push('**问题：** ' + card.question, '', '<details><summary>查看答案</summary>', '', card.answer, '', '</details>', '')
      })
    }
  })

  return lines.join('\n')
}

export async function createProjectArchive(project: CourseProject) {
  const zip = new JSZip()
  const assets = zip.folder('assets')!
  const title = cleanName(project.title) || '学习笔记'

  const attachmentPath = (attachment: ChapterAttachment, chapterIndex: number) => {
    return `./files/chapter-${String(chapterIndex + 1).padStart(3, '0')}/${safeArchivePath(attachment.relativePath)}`
  }
  const embeddedMarkdown = buildProjectMarkdown(project, (screenshot) => screenshot.dataUrl, attachmentPath)
  const relativeMarkdown = buildProjectMarkdown(project, (screenshot, chapterIndex, screenshotIndex) => {
    return `./assets/${assetName(chapterIndex, screenshotIndex, screenshot)}`
  }, attachmentPath)

  for (let chapterIndex = 0; chapterIndex < project.chapters.length; chapterIndex += 1) {
    const chapter = project.chapters[chapterIndex]
    chapter.screenshots.forEach((screenshot, screenshotIndex) => {
      const { bytes } = parseDataUrl(screenshot.dataUrl)
      assets.file(assetName(chapterIndex, screenshotIndex, screenshot), bytes, { binary: true })
    })
    for (const attachment of chapter.attachments ?? []) {
      const bytes = await attachmentBytes(attachment)
      zip.file(`files/chapter-${String(chapterIndex + 1).padStart(3, '0')}/${safeArchivePath(attachment.relativePath)}`, bytes, { binary: true })
    }
  }

  zip.file(`${title}.md`, embeddedMarkdown)
  zip.file(`${title}-相对路径版.md`, relativeMarkdown)
  zip.file('README.txt', [
    `${title}.md：图片已内嵌，可单独打开。`,
    `${title}-相对路径版.md：使用 assets 文件夹，适合支持相对路径的 Markdown 工具。`,
    '使用相对路径版时，请先解压整个 ZIP 并保持 assets 文件夹位置不变。',
    '章节导入的文件保存在 files 文件夹中，并保留项目相对路径。',
  ].join('\r\n'))

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

export async function exportProject(project: CourseProject) {
  const blob = await createProjectArchive(project)
  saveAs(blob, `${cleanName(project.title) || '学习笔记'}-学习笔记.zip`)
}
