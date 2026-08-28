import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, FolderOpen, Replace, X } from 'lucide-react'
import { findDuplicateProject } from '../lib/projectNames'
import type { CourseProject } from '../types'

interface Props {
  open: boolean
  project?: CourseProject
  projects: CourseProject[]
  onClose: () => void
  onRename: (projectId: string, title: string) => void
  onUseExisting: (projectId: string) => void
  onReplaceExisting: (projectId: string, existingProjectId: string, title: string) => void
}

export default function RenameProjectDialog({ open, project, projects, onClose, onRename, onUseExisting, onReplaceExisting }: Props) {
  const [title, setTitle] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const trimmedTitle = title.trim()
  const duplicate = project ? findDuplicateProject(projects, trimmedTitle, project.id) : undefined

  useEffect(() => {
    if (!open || !project) return
    setTitle(project.title)
    setConfirmReplace(false)
  }, [open, project])

  if (!open || !project) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!trimmedTitle || duplicate || trimmedTitle === project.title) return
    onRename(project.id, trimmedTitle)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal compact-modal project-name-modal" onSubmit={submit}>
        <header className="modal-header">
          <div><p className="eyebrow">课程管理</p><h2>重命名课程</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <label className="field-label" htmlFor="rename-project-title">课程名称</label>
        <input id="rename-project-title" className="text-input" autoFocus value={title} onChange={(event) => { setTitle(event.target.value); setConfirmReplace(false) }} />

        {duplicate && (
          <div className={`project-name-conflict ${confirmReplace ? 'confirming' : ''}`}>
            <AlertTriangle size={18} />
            <div>
              <strong>已经存在“{duplicate.title}”</strong>
              <p>{confirmReplace ? '确认后，已有同名课程及其章节、笔记、截图和应用托管副本会被删除，当前课程将保留并使用这个名称。' : '请选择使用已有课程，或用当前课程替换已有同名课程。'}</p>
            </div>
          </div>
        )}

        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          {duplicate ? <>
            {!confirmReplace && <button className="secondary-button" type="button" onClick={() => { onUseExisting(duplicate.id); onClose() }}><FolderOpen size={15} />使用已有课程</button>}
            {!confirmReplace
              ? <button className="danger-button" type="button" onClick={() => setConfirmReplace(true)}><Replace size={15} />替换已有课程</button>
              : <button className="danger-button" type="button" onClick={() => { onReplaceExisting(project.id, duplicate.id, trimmedTitle); onClose() }}>确认替换</button>}
          </> : <button className="primary-button" type="submit" disabled={!trimmedTitle || trimmedTitle === project.title}>保存名称</button>}
        </footer>
      </form>
    </div>
  )
}
