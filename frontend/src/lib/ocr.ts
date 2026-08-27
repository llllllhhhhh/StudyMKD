import type { Chapter } from '../types'
import { createChapter } from './data'

const NUMBERED_LINE = /^\s*((?:第[一二三四五六七八九十百零〇0-9]+[章节篇])|(?:\d+(?:[.、-]\d+)*[.、]?))\s*(.+)$/

const normalizeLine = (line: string) => line
  .replace(/[．。]/g, '.')
  .replace(/[｜|]/g, ' ')
  .replace(/^[•·●○◆◇■□▶▷►▪▫*-]+\s*/, '')
  .replace(/\s+/g, ' ')
  .trim()

export function parseCatalogText(text: string): Chapter[] {
  const normalizedLines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length > 1 && line.length < 120)
    .filter((line) => !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(line))

  const firstStructuredLine = normalizedLines.findIndex((line) => NUMBERED_LINE.test(line))
  const lines = firstStructuredLine > 0 && /(?:课程)?目录|contents/i.test(normalizedLines[0])
    ? normalizedLines.slice(1)
    : normalizedLines

  return lines.map((line) => {
    const match = line.match(NUMBERED_LINE)
    if (!match) return createChapter(line, 1)
    const prefix = match[1]
    const numericDepth = prefix.match(/\d+/g)?.length ?? 1
    const level = prefix.startsWith('第') ? 1 : Math.min(numericDepth, 3)
    return createChapter(`${prefix} ${match[2]}`.trim(), level)
  })
}

export async function recognizeCatalog(
  file: File,
  onProgress: (progress: number, status: string) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined
  try {
    worker = await createWorker(['chi_sim', 'eng'], 1, {
      langPath: `${window.location.origin}/tessdata`,
      workerPath: `${window.location.origin}/tesseract/worker.min.js`,
      corePath: `${window.location.origin}/tesseract-core`,
      logger: (message) => onProgress(message.progress ?? 0, message.status),
    })
    await worker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const image = await prepareImage(file)
    const result = await worker.recognize(image)
    return result.data.text.trim()
  } finally {
    await worker?.terminate()
  }
}

async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = bitmap.width < 1800 ? Math.min(2.5, 1800 / bitmap.width) : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.filter = 'grayscale(1) contrast(1.35)'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法处理图片')), 'image/png')
  })
}
