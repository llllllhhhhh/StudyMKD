import { useEffect, useRef, useState } from 'react'
import { Copy, File as FileIcon, FileCode2, FileText, Film, FolderOpen, FolderOutput, Image as ImageIcon, Music, X } from 'lucide-react'
import type { ChapterAttachment } from '../types'
import { attachmentFile, formatFileSize, saveAttachmentsToDirectory } from '../lib/fileUtils'

interface Props {
  attachments: ChapterAttachment[]
  initialAttachmentId: string
  title: string
  onClose: () => void
  onOpenLocalFolder: (attachment?: ChapterAttachment) => Promise<string>
}

const TEXT_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'cs', 'java', 'kt', 'swift', 'go', 'rs',
  'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'rb', 'php', 'sh', 'ps1',
  'html', 'htm', 'css', 'scss', 'less', 'json', 'yaml', 'yml', 'toml', 'xml',
  'md', 'txt', 'csv', 'sql', 'ini', 'cfg', 'conf', 'cmake', 'gradle', 'gitignore',
])

function extension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : name.toLowerCase()
}

function fileKind(attachment: ChapterAttachment) {
  if (attachment.mime.startsWith('image/')) return 'image'
  if (attachment.mime === 'application/pdf') return 'pdf'
  if (attachment.mime.startsWith('video/')) return 'video'
  if (attachment.mime.startsWith('audio/')) return 'audio'
  if (attachment.mime.startsWith('text/') || TEXT_EXTENSIONS.has(extension(attachment.name))) return 'text'
  return 'binary'
}

function AttachmentIcon({ attachment }: { attachment: ChapterAttachment }) {
  const kind = fileKind(attachment)
  if (kind === 'image') return <ImageIcon size={17} />
  if (kind === 'video') return <Film size={17} />
  if (kind === 'audio') return <Music size={17} />
  if (kind === 'text' && extension(attachment.name) !== 'txt' && extension(attachment.name) !== 'md') return <FileCode2 size={17} />
  if (kind === 'text' || kind === 'pdf') return <FileText size={17} />
  return <FileIcon size={17} />
}

export default function AttachmentViewer({ attachments, initialAttachmentId, title, onClose, onOpenLocalFolder }: Props) {
  const [selectedId, setSelectedId] = useState(initialAttachmentId || attachments[0]?.id || '')
  const previewRef = useRef<HTMLDivElement>(null)
  const selected = attachments.find((attachment) => attachment.id === selectedId) ?? attachments[0]
  const kind = selected ? fileKind(selected) : 'binary'
  const [previewUrl, setPreviewUrl] = useState('')
  const [text, setText] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [loading, setLoading] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      previewRef.current?.scrollTo({ top: 0, left: 0 })
      previewRef.current?.querySelector('pre')?.scrollTo({ top: 0, left: 0 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selected?.id])

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setPreviewUrl('')
    setText('')
    setPreviewError('')
    if (!selected) return
    setLoading(true)
    attachmentFile(selected).then(async (file) => {
      if (!active) return
      if (kind === 'text' && file.size <= 2 * 1024 * 1024) {
        setText(await file.text())
      } else if (kind !== 'binary') {
        objectUrl = URL.createObjectURL(file)
        setPreviewUrl(objectUrl)
      }
    }).catch((error) => {
      if (active) setPreviewError(error instanceof Error ? error.message : '文件无法读取')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [kind, selected?.id])

  const storageLocation = selected
    ? selected.nativePath ?? (selected.storageMode === 'linked'
      ? `原文件链接/${selected.relativePath}`
      : `IndexedDB://笔记/${title}/${selected.relativePath}`)
    : ''

  const copyLocation = async () => {
    try {
      await navigator.clipboard.writeText(storageLocation)
      setLocationMessage('存储位置已复制')
    } catch {
      setLocationMessage('浏览器未允许复制，请手动选择路径文字')
    }
  }

  const saveToFolder = async () => {
    if (!window.confirm('保存到文件夹会覆盖其中的同名文件，继续吗？')) return
    setLocationMessage('正在保存…')
    try {
      const folderName = await saveAttachmentsToDirectory(attachments)
      setLocationMessage(`已保存到“${folderName}”文件夹`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setLocationMessage('')
        return
      }
      setLocationMessage(error instanceof Error ? error.message : '保存失败')
    }
  }

  const openLocalFolder = async (attachment?: ChapterAttachment) => {
    setLocationMessage('正在同步本地副本…')
    try {
      const path = await onOpenLocalFolder(attachment)
      setLocationMessage(`已打开：${path}`)
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : '无法打开本地文件夹')
    }
  }

  return (
    <div className="attachment-viewer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="attachment-viewer" role="dialog" aria-modal="true" aria-label="打开文件或项目">
        <header className="attachment-viewer-header">
          <div><p className="eyebrow">章节文件</p><h2>{title}</h2></div>
          <button className="icon-button" type="button" title="关闭文件浏览器" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="attachment-viewer-body">
          <aside className="attachment-browser-list" aria-label="项目文件列表">
            <div className="attachment-browser-root"><FolderOpen size={16} /><span>项目文件</span><strong>{attachments.length}</strong></div>
            <nav>
              {attachments.map((attachment) => (
                <button key={attachment.id} className={attachment.id === selected?.id ? 'active' : ''} type="button" onClick={() => setSelectedId(attachment.id)}>
                  <span className="browser-file-icon"><AttachmentIcon attachment={attachment} /></span>
                  <span className="browser-file-copy"><strong>{attachment.name}</strong><small>{attachment.relativePath}</small></span>
                </button>
              ))}
            </nav>
          </aside>
          <main className="attachment-preview">
            {selected && <header className="attachment-preview-header">
              <div className="attachment-preview-copy">
                <strong>{selected.name}</strong>
                <span>{selected.relativePath}</span>
                <small title={storageLocation}>{storageLocation}</small>
              </div>
              <div className="attachment-preview-controls">
                <div className="attachment-preview-meta"><span className={`storage-badge ${selected.storageMode === 'linked' ? 'linked' : ''}`}>{selected.storageMode === 'linked' ? '原文件链接' : '托管副本'}</span><span>{formatFileSize(selected.size)}</span></div>
                <div className="attachment-location-actions">
                  <button className="icon-button" type="button" title="复制存储位置" onClick={() => void copyLocation()}><Copy size={15} /></button>
                  <button className="icon-button" type="button" title="在资源管理器中显示" onClick={() => void openLocalFolder(selected)}><FolderOpen size={15} /></button>
                  <button className="secondary-button" type="button" onClick={() => void openLocalFolder()}><FolderOpen size={15} />打开本地文件夹</button>
                  <button className="secondary-button" type="button" onClick={() => void saveToFolder()}><FolderOutput size={15} />保存到文件夹</button>
                </div>
                {locationMessage && <span className="attachment-location-message">{locationMessage}</span>}
              </div>
            </header>}
            <div ref={previewRef} className={`attachment-preview-content preview-${kind}`}>
              {loading && <div className="attachment-no-preview"><FileIcon size={24} /><strong>正在读取文件</strong></div>}
              {previewError && <div className="attachment-no-preview error"><FileIcon size={28} /><strong>文件无法打开</strong><span>{previewError}</span></div>}
              {!loading && !previewError && selected && kind === 'image' && <img src={previewUrl} alt={selected.name} />}
              {!loading && !previewError && selected && kind === 'pdf' && <iframe src={previewUrl} title={selected.name} sandbox="" />}
              {!loading && !previewError && selected && kind === 'video' && <video src={previewUrl} controls />}
              {!loading && !previewError && selected && kind === 'audio' && <audio src={previewUrl} controls />}
              {!loading && !previewError && selected && kind === 'text' && selected.size <= 2 * 1024 * 1024 && <pre><code>{text}</code></pre>}
              {!loading && !previewError && selected && kind === 'text' && selected.size > 2 * 1024 * 1024 && <div className="attachment-no-preview"><FileCode2 size={28} /><strong>文件过大，暂不预览</strong><span>{selected.mime}</span></div>}
              {!loading && !previewError && selected && kind === 'binary' && <div className="attachment-no-preview"><FileIcon size={28} /><strong>{selected.name}</strong><span>{selected.mime || '二进制文件'} · {formatFileSize(selected.size)}</span></div>}
            </div>
          </main>
        </div>
      </section>
    </div>
  )
}
