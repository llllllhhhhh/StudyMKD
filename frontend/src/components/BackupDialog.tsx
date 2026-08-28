import { ChangeEvent, useRef, useState } from 'react'
import { Archive, Check, Download, FileJson, FolderInput, TriangleAlert, X } from 'lucide-react'
import saveAs from 'file-saver'
import type { AppData } from '../types'
import { mergeBackupData, parseBackup, serializeBackup } from '../lib/backup'
import { formatFileSize } from '../lib/fileUtils'

interface Props {
  open: boolean
  data: AppData
  onClose: () => void
  onRestore: (data: AppData, mode: 'replace' | 'merge') => void
}

export default function BackupDialog({ open, data, onClose, onRestore }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<{ exportedAt: string; projectCount: number; chapterCount: number; projectTitles: Array<{ title: string; count: number }> }>()
  const [pending, setPending] = useState<AppData>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const reset = () => {
    setFileName('')
    setPreview(undefined)
    setPending(undefined)
    setError('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const exportBackup = () => {
    const json = serializeBackup(data)
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    saveAs(blob, `StudyMKD-备份-${stamp}.json`)
  }

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setFileName(file.name)
    if (file.size > 200 * 1024 * 1024) {
      setError('备份文件过大（超过 200 MB），无法导入')
      return
    }
    try {
      const parsed = parseBackup(await file.text())
      const projectTitles = parsed.projects.map((project) => ({
        title: project.title,
        count: project.chapters.length,
      }))
      setPreview({
        exportedAt: new Date().toLocaleString('zh-CN'),
        projectCount: parsed.projects.length,
        chapterCount: parsed.projects.reduce((total, project) => total + project.chapters.length, 0),
        projectTitles,
      })
      setPending(parsed)
    } catch (reason) {
      setPreview(undefined)
      setPending(undefined)
      setError(reason instanceof Error ? reason.message : '备份文件解析失败')
    }
  }

  const restore = (mode: 'replace' | 'merge') => {
    if (!pending) return
    setBusy(true)
    try {
      onRestore(mode === 'replace' ? pending : mergeBackupData(data, pending), mode)
      reset()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal backup-modal" role="dialog" aria-modal="true" aria-label="数据备份与恢复">
        <header className="modal-header">
          <div><p className="eyebrow">本地数据</p><h2>备份与恢复</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={close}><X size={19} /></button>
        </header>

        <div className="backup-body">
          <section className="backup-section">
            <div className="backup-section-icon"><Download size={18} /></div>
            <div className="backup-section-copy">
              <strong>导出完整备份</strong>
              <span>包含全部课程、笔记、截图、附件、复习卡片与学习计时，保存为单个 JSON 文件。</span>
            </div>
            <button className="secondary-button" type="button" onClick={exportBackup}><Archive size={15} />导出备份</button>
          </section>

          <section className="backup-section">
            <div className="backup-section-icon"><FolderInput size={18} /></div>
            <div className="backup-section-copy">
              <strong>导入备份</strong>
              <span>从 JSON 备份恢复数据。可以选择替换当前全部数据，或合并导入（仅添加备份中不存在的新课程）。</span>
            </div>
            <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void chooseFile(event)} />
            <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}><FileJson size={15} />选择备份文件</button>
          </section>

          {fileName && (
            <div className="backup-preview">
              <div className="backup-preview-heading">
                <Check size={15} />
                <strong>{fileName}</strong>
                <span>{formatFileSize(pending ? JSON.stringify(pending).length : 0)}</span>
              </div>
              {preview && (
                <div className="backup-preview-stats">
                  <p>包含 {preview.projectCount} 个课程、{preview.chapterCount} 个章节</p>
                  <ul>
                    {preview.projectTitles.map((project) => (
                      <li key={project.title}><span>{project.title}</span><em>{project.count} 章</em></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && <p className="error-message"><TriangleAlert size={14} />{error}</p>}
        </div>

        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={close}>取消</button>
          {pending && preview && (
            <>
              <button className="danger-button" type="button" disabled={busy} onClick={() => restore('replace')}>替换当前全部数据</button>
              <button className="primary-button" type="button" disabled={busy} onClick={() => restore('merge')}>合并导入新课程</button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}
