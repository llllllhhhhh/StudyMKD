import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import type { CourseProject } from '../types'

interface Props {
  projects: CourseProject[]
  activeProjectId: string
  onSelect: (projectId: string) => void
  onCreate: () => void
  onRename: (projectId: string) => void
  onDelete: (projectId: string) => void
}

export default function CoursePicker({ projects, activeProjectId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="course-picker" ref={container}>
      <button className="course-picker-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{activeProject?.title ?? '选择课程'}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="course-picker-menu" role="menu" aria-label="课程列表">
          <div className="course-picker-list">
            {projects.map((project) => (
              <div className={`course-picker-row ${project.id === activeProjectId ? 'active' : ''}`} key={project.id}>
                <button className="course-picker-name" type="button" role="menuitem" title={project.title} onClick={() => { onSelect(project.id); setOpen(false) }}>
                  <span>{project.title}</span>{project.id === activeProjectId && <Check size={14} />}
                </button>
                <button className="icon-button" type="button" title={`重命名“${project.title}”`} onClick={() => { onRename(project.id); setOpen(false) }}><Pencil size={13} /></button>
                <button className="icon-button danger" type="button" title={`删除“${project.title}”`} onClick={() => { onDelete(project.id); setOpen(false) }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button className="course-picker-create" type="button" onClick={() => { onCreate(); setOpen(false) }}><Plus size={15} />新建课程</button>
        </div>
      )}
    </div>
  )
}
