import type { Chapter, ChapterAttachment, CourseProject, Screenshot } from '../types'
import { attachmentFile } from './fileUtils'

type MaterializeResult = {
  rootPath: string
  files: Array<{ relativePath: string; nativePath: string }>
}

async function fileBase64(attachment: ChapterAttachment) {
  const file = await attachmentFile(attachment)
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function dataUrlBase64(dataUrl: string) {
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error('截图数据格式无效')
  return dataUrl.slice(separator + 1)
}

function screenshotExtension(dataUrl: string) {
  const mime = dataUrl.match(/^data:([^;,]+)/)?.[1]
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[mime ?? ''] ?? 'png'
}

async function nativeRequest<T>(path: string, body?: unknown) {
  const response = await fetch(`/api/native/${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error || '本地文件夹操作失败')
  return result
}

const location = (item: Pick<CourseProject | Chapter, 'id' | 'title'>) => ({ id: item.id, title: item.title })

export async function nativeBridgeCapabilities() {
  return nativeRequest<{ nativeFolderBridge: boolean; platform: string; managedRoot: string }>('capabilities')
}

export async function materializeChapterFiles(project: CourseProject, chapter: Chapter, openExplorer: boolean) {
  const files = await Promise.all((chapter.attachments ?? []).map(async (attachment) => ({
    relativePath: attachment.relativePath,
    base64: await fileBase64(attachment),
  })))
  return nativeRequest<MaterializeResult>('materialize', {
    project: location(project),
    chapter: location(chapter),
    files,
    openExplorer,
  })
}

export async function revealManagedPath(project: CourseProject, chapter: Chapter, relativePath?: string) {
  return nativeRequest<{ path: string }>('reveal', {
    project: location(project),
    chapter: location(chapter),
    relativePath,
  })
}

export async function deleteManagedAttachment(project: CourseProject, chapter: Chapter, attachment: ChapterAttachment) {
  return nativeRequest<{ removed: boolean; path: string }>('delete-managed', {
    project: location(project),
    chapter: location(chapter),
    relativePath: attachment.relativePath,
  })
}

export function screenshotManagedRelativePath(screenshot: Screenshot) {
  return `screenshots/${screenshot.id}.${screenshotExtension(screenshot.dataUrl)}`
}

export async function materializeChapterScreenshots(project: CourseProject, chapter: Chapter, screenshots: Screenshot[]) {
  const files = screenshots.map((screenshot) => ({
    relativePath: screenshotManagedRelativePath(screenshot),
    base64: dataUrlBase64(screenshot.dataUrl),
  }))
  return nativeRequest<MaterializeResult>('materialize', {
    project: location(project),
    chapter: location(chapter),
    files,
    openExplorer: false,
  })
}

export async function deleteManagedRelativePath(project: CourseProject, chapter: Chapter, relativePath: string) {
  return nativeRequest<{ removed: boolean; path: string }>('delete-managed', {
    project: location(project),
    chapter: location(chapter),
    relativePath,
  })
}

export async function renameManagedProject(project: CourseProject, title: string) {
  return nativeRequest<{ moved: boolean; oldPath: string; newPath: string }>('rename-managed-project', {
    project: { id: project.id, title: project.title },
    title,
  })
}

export async function deleteManagedProject(project: CourseProject) {
  return nativeRequest<{ removed: boolean; path: string }>('delete-managed-project', {
    project: { id: project.id, title: project.title },
  })
}
