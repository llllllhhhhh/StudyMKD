import saveAs from 'file-saver'
import TurndownService from 'turndown'
import type { Chapter, CourseProject } from '../types'

export const CARD_SOURCE_FORMAT = 'studymkd-note'
export const CARD_IMPORT_FORMAT = 'studymkd-cards'
export const CARD_EXCHANGE_VERSION = 1

export interface CardSourceFile {
  format: typeof CARD_SOURCE_FORMAT
  version: typeof CARD_EXCHANGE_VERSION
  exportedAt: string
  project: { id: string; title: string }
  chapter: { id: string; title: string }
  note: { markdown: string; contentHash: string }
}

export interface GeneratedCardDraft {
  question: string
  answer: string
  sourceExcerpt?: string
  tags?: string[]
}

export interface GeneratedCardsFile {
  format: typeof CARD_IMPORT_FORMAT
  version: typeof CARD_EXCHANGE_VERSION
  generatedAt: string
  source: {
    projectId: string
    projectTitle: string
    chapterId: string
    chapterTitle: string
    contentHash: string
  }
  cards: GeneratedCardDraft[]
}

export interface ParsedGeneratedCards {
  file: GeneratedCardsFile
  cards: GeneratedCardDraft[]
  duplicateInFileCount: number
}

const cleanName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').trim()

function noteMarkdownForCards(chapter: Chapter) {
  const documentNode = new DOMParser().parseFromString(chapter.noteHtml, 'text/html')
  documentNode.querySelectorAll<HTMLImageElement>('img[data-screenshot-id]').forEach((image) => {
    const screenshot = chapter.screenshots.find((item) => item.id === image.dataset.screenshotId)
    const label = screenshot?.caption || image.alt || screenshot?.name || '笔记图片'
    image.replaceWith(documentNode.createTextNode(`[笔记图片：${label}]`))
  })

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
  return turndown.turndown(documentNode.body.innerHTML).trim()
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildCardSource(project: CourseProject, chapter: Chapter): Promise<CardSourceFile> {
  const markdown = noteMarkdownForCards(chapter)
  if (!markdown) throw new Error('当前章节还没有可用于制卡的笔记内容')
  return {
    format: CARD_SOURCE_FORMAT,
    version: CARD_EXCHANGE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { id: project.id, title: project.title },
    chapter: { id: chapter.id, title: chapter.title },
    note: { markdown, contentHash: await sha256(markdown) },
  }
}

export async function exportCardSource(project: CourseProject, chapter: Chapter) {
  const source = await buildCardSource(project, chapter)
  const blob = new Blob([`${JSON.stringify(source, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
  saveAs(blob, `${cleanName(project.title)}-${cleanName(chapter.title)}.studymkd-note.json`)
  return source
}

export function normalizeCardQuestion(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replace(/[\s?？!！.,，。:：;；'"“”‘’()（）[\]{}]/g, '')
}

function requireText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  const text = value.trim()
  if (text.length > maxLength) throw new Error(`${label}超过 ${maxLength} 个字符`)
  return text
}

export function parseGeneratedCards(text: string, project: CourseProject, chapter: Chapter): ParsedGeneratedCards {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('卡片文件不是有效的 JSON')
  }
  if (!value || typeof value !== 'object') throw new Error('卡片文件结构无效')
  const candidate = value as Partial<GeneratedCardsFile>
  if (candidate.format !== CARD_IMPORT_FORMAT || candidate.version !== CARD_EXCHANGE_VERSION) {
    throw new Error('不是受支持的 StudyMKD 卡片文件')
  }
  if (!candidate.source || candidate.source.projectId !== project.id || candidate.source.chapterId !== chapter.id) {
    throw new Error('卡片文件不属于当前课程和章节')
  }
  if (typeof candidate.source.contentHash !== 'string' || !candidate.source.contentHash) {
    throw new Error('卡片文件缺少笔记来源标识')
  }
  if (!Array.isArray(candidate.cards) || !candidate.cards.length) throw new Error('卡片文件中没有可导入的卡片')
  if (candidate.cards.length > 100) throw new Error('单次最多导入 100 张卡片')

  const seen = new Set<string>()
  let duplicateInFileCount = 0
  const cards: GeneratedCardDraft[] = []
  candidate.cards.forEach((card, index) => {
    if (!card || typeof card !== 'object') throw new Error(`第 ${index + 1} 张卡片结构无效`)
    const item = card as GeneratedCardDraft
    const question = requireText(item.question, `第 ${index + 1} 张卡片的问题`, 500)
    const answer = requireText(item.answer, `第 ${index + 1} 张卡片的答案`, 5000)
    const normalized = normalizeCardQuestion(question)
    if (seen.has(normalized)) {
      duplicateInFileCount += 1
      return
    }
    seen.add(normalized)
    const tags = Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 10)
      : undefined
    cards.push({
      question,
      answer,
      sourceExcerpt: typeof item.sourceExcerpt === 'string' ? item.sourceExcerpt.trim().slice(0, 1000) : undefined,
      tags: tags?.length ? Array.from(new Set(tags)) : undefined,
    })
  })
  if (!cards.length) throw new Error('卡片文件中没有不重复的有效卡片')
  return { file: candidate as GeneratedCardsFile, cards, duplicateInFileCount }
}
