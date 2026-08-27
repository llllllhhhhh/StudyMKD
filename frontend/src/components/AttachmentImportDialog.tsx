import { useEffect, useState } from 'react'
import { FolderSymlink, HardDrive, Link2, X } from 'lucide-react'

export type AttachmentImportKind = 'files' | 'folder'
export type AttachmentStorageMode = 'managed' | 'linked'

interface Props {
  open: boolean
  kind: AttachmentImportKind
  linkedSupported: boolean
  onClose: () => void
  onConfirm: (mode: AttachmentStorageMode) => void
}

export default function AttachmentImportDialog({ open, kind, linkedSupported, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<AttachmentStorageMode>('managed')
  useEffect(() => { if (!open) setMode('managed') }, [open])
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal storage-mode-modal" role="dialog" aria-modal="true" aria-label="选择文件存储方式">
        <header className="modal-header">
          <div><p className="eyebrow">{kind === 'folder' ? '导入项目文件夹' : '导入章节文件'}</p><h2>选择存储方式</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="storage-mode-options" role="radiogroup" aria-label="文件存储方式">
          <button className={mode === 'managed' ? 'active' : ''} type="button" role="radio" aria-checked={mode === 'managed'} onClick={() => setMode('managed')}>
            <span className="storage-mode-icon"><HardDrive size={20} /></span>
            <span><strong>项目托管目录</strong><small>复制一份到应用本地存储，原文件移动后仍可使用</small></span>
          </button>
          <button className={mode === 'linked' ? 'active' : ''} type="button" role="radio" aria-checked={mode === 'linked'} disabled={!linkedSupported} onClick={() => setMode('linked')}>
            <span className="storage-mode-icon"><Link2 size={20} /></span>
            <span><strong>链接原文件</strong><small>{linkedSupported ? '不复制内容，预览和导出时读取原文件' : '当前环境不支持，需要 C++ 桌面版'}</small></span>
          </button>
        </div>
        <div className="storage-mode-note"><FolderSymlink size={15} /><span>{mode === 'linked' ? '原文件移动、删除或权限失效后，链接将无法读取。' : '会额外占用本地存储空间，导出时包含完整副本。'}</span></div>
        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="button" onClick={() => onConfirm(mode)}>继续选择</button>
        </footer>
      </section>
    </div>
  )
}
