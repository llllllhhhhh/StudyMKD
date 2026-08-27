export function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('文件数据格式无效')
  const mime = match[1] || 'application/octet-stream'
  const raw = match[3]
  const binary = match[2] ? atob(raw) : decodeURIComponent(raw)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { mime, bytes }
}

export function safeArchivePath(path: string) {
  const parts = path
    .split(/[\\/]+/)
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replace(/[<>:"|?*]/g, '-'))
  return parts.join('/') || 'file'
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export async function attachmentFile(attachment: import('../types').ChapterAttachment) {
  if (attachment.storageMode === 'linked') {
    if (!attachment.fileHandle) throw new Error('原文件链接不可用，请重新导入')
    return attachment.fileHandle.getFile()
  }
  if (!attachment.dataUrl) throw new Error('托管文件数据不存在')
  const { mime, bytes } = parseDataUrl(attachment.dataUrl)
  return new File([bytes], attachment.name, { type: attachment.mime || mime })
}

export async function attachmentBytes(attachment: import('../types').ChapterAttachment) {
  const file = await attachmentFile(attachment)
  return new Uint8Array(await file.arrayBuffer())
}

export async function saveAttachmentsToDirectory(attachments: import('../types').ChapterAttachment[]) {
  if (typeof window.showDirectoryPicker !== 'function') throw new Error('当前环境不支持选择保存文件夹')
  const root = await window.showDirectoryPicker()
  for (const attachment of attachments) {
    const parts = safeArchivePath(attachment.relativePath).split('/')
    const fileName = parts.pop() || attachment.name
    let directory = root
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true })
    const output = await directory.getFileHandle(fileName, { create: true })
    const writable = await output.createWritable()
    await writable.write(await attachmentFile(attachment))
    await writable.close()
  }
  return root.name
}
