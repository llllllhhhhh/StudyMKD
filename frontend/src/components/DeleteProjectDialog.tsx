import { Trash2, X } from 'lucide-react'
import type { CourseProject } from '../types'

interface Props {
  open: boolean
  project?: CourseProject
  busy: boolean
  onClose: () => void
  onConfirm: (project: CourseProject) => void
}

export default function DeleteProjectDialog({ open, project, busy, onClose, onConfirm }: Props) {
  if (!open || !project) return null
  const noteCount = project.chapters.filter((chapter) => chapter.noteHtml.trim()).length
  const attachmentCount = project.chapters.reduce((total, chapter) => total + (chapter.attachments?.length ?? 0), 0)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="modal compact-modal delete-project-modal" role="dialog" aria-modal="true" aria-label="删除课程">
        <header className="modal-header">
          <div><p className="eyebrow">课程管理</p><h2>删除课程</h2></div>
          <button className="icon-button" type="button" title="关闭" disabled={busy} onClick={onClose}><X size={19} /></button>
        </header>
        <div className="delete-project-summary">
          <div className="delete-project-icon"><Trash2 size={21} /></div>
          <strong>删除“{project.title}”？</strong>
          <p>将删除 {project.chapters.length} 个章节、{noteCount} 篇笔记和 {attachmentCount} 个附件记录。应用托管副本会一并清理，但链接的源文件和手动导出的文件不会删除。</p>
        </div>
        <footer className="modal-footer">
          <button className="text-button" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className="danger-button" type="button" disabled={busy} onClick={() => onConfirm(project)}>{busy ? '正在删除' : '确认删除'}</button>
        </footer>
      </section>
    </div>
  )
}
