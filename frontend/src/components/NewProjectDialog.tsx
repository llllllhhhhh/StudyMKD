import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, FolderOpen, Replace, X } from 'lucide-react'
import { findDuplicateProject } from '../lib/projectNames'
import type { CourseProject, ExpectedDurationUnit } from '../types'

interface Props {
  open: boolean
  projects: CourseProject[]
  onClose: () => void
  onCreate: (title: string, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => void
  onUseExisting: (projectId: string) => void
  onReplaceExisting: (projectId: string, title: string, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => void
}

export default function NewProjectDialog({ open, projects, onClose, onCreate, onUseExisting, onReplaceExisting }: Props) {
  const [title, setTitle] = useState('')
  const [expectedDurationValue, setExpectedDurationValue] = useState(4)
  const [expectedDurationUnit, setExpectedDurationUnit] = useState<ExpectedDurationUnit>('week')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const trimmedTitle = title.trim()
  const duplicate = findDuplicateProject(projects, trimmedTitle)
  useEffect(() => {
    if (!open) {
      setTitle('')
      setExpectedDurationValue(4)
      setExpectedDurationUnit('week')
      setConfirmReplace(false)
    }
  }, [open])
  if (!open) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!trimmedTitle || duplicate) return
    onCreate(trimmedTitle, expectedDurationValue, expectedDurationUnit)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal compact-modal project-name-modal" onSubmit={submit}>
        <header className="modal-header">
          <div><p className="eyebrow">课程项目</p><h2>新建课程</h2></div>
          <button className="icon-button" title="关闭" type="button" onClick={onClose}><X size={19} /></button>
        </header>
        <label className="field-label" htmlFor="project-title">课程名称</label>
        <input id="project-title" className="text-input" autoFocus value={title} onChange={(event) => { setTitle(event.target.value); setConfirmReplace(false) }} placeholder="例如：现代 C++ 系统课" />
        <label className="field-label" htmlFor="expected-duration">预计完成时间</label>
        <div className="duration-field">
          <CalendarClock size={17} />
          <input
            id="expected-duration"
            type="number"
            min="1"
            max="999"
            value={expectedDurationValue}
            onChange={(event) => setExpectedDurationValue(Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 1))))}
            aria-label="预计完成时间"
          />
          <select value={expectedDurationUnit} onChange={(event) => setExpectedDurationUnit(event.target.value as ExpectedDurationUnit)} aria-label="预计完成时间单位">
            <option value="day">天</option>
            <option value="week">周</option>
            <option value="month">月</option>
          </select>
        </div>
        {duplicate && (
          <div className={`project-name-conflict ${confirmReplace ? 'confirming' : ''}`}>
            <AlertTriangle size={18} />
            <div>
              <strong>已经存在“{duplicate.title}”</strong>
              <p>{confirmReplace ? '确认后，已有课程及其章节、笔记、截图和应用托管副本会被删除，并创建一个新的空白同名课程。' : '不会创建重复课程。请选择直接使用已有课程，或替换已有课程。'}</p>
            </div>
          </div>
        )}
        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          {duplicate ? <>
            {!confirmReplace && <button className="secondary-button" type="button" onClick={() => { onUseExisting(duplicate.id); onClose() }}><FolderOpen size={15} />使用已有课程</button>}
            {!confirmReplace
              ? <button className="danger-button" type="button" onClick={() => setConfirmReplace(true)}><Replace size={15} />替换已有课程</button>
              : <button className="danger-button" type="button" onClick={() => { onReplaceExisting(duplicate.id, trimmedTitle, expectedDurationValue, expectedDurationUnit); onClose() }}>确认替换</button>}
          </> : <button className="primary-button" type="submit" disabled={!trimmedTitle}>创建课程</button>}
        </footer>
      </form>
    </div>
  )
}
