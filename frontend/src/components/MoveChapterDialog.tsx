import { FolderTree, Move, X } from 'lucide-react'
import type { Chapter, CourseProject } from '../types'

interface Props {
  open: boolean
  chapter?: Chapter
  currentProject: CourseProject
  projects: CourseProject[]
  onClose: () => void
  onMove: (targetProjectId: string) => void
}

export default function MoveChapterDialog({ open, chapter, currentProject, projects, onClose, onMove }: Props) {
  if (!open || !chapter) return null
  const targets = projects.filter((project) => project.id !== currentProject.id)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal compact-modal move-chapter-modal" role="dialog" aria-modal="true" aria-label="移动章节">
        <header className="modal-header">
          <div><p className="eyebrow">章节管理</p><h2>移动章节</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <p className="move-chapter-copy">
          将“<strong>{chapter.title}</strong>”移动到其他课程。章节的笔记、截图、卡片和附件会一并移动。
        </p>
        {!targets.length ? (
          <div className="move-chapter-empty"><FolderTree size={20} /><span>当前没有其他课程可供移动</span></div>
        ) : (
          <div className="move-chapter-list">
            {targets.map((project) => (
              <button key={project.id} className="move-chapter-row" type="button" onClick={() => { onMove(project.id); onClose() }}>
                <FolderTree size={15} />
                <span><strong>{project.title}</strong><small>{project.chapters.length} 个章节</small></span>
                <Move size={14} />
              </button>
            ))}
          </div>
        )}
        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </footer>
      </section>
    </div>
  )
}
