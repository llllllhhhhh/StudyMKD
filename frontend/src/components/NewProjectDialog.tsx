import { FormEvent, useEffect, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import type { ExpectedDurationUnit } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (title: string, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => void
}

export default function NewProjectDialog({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [expectedDurationValue, setExpectedDurationValue] = useState(4)
  const [expectedDurationUnit, setExpectedDurationUnit] = useState<ExpectedDurationUnit>('week')
  useEffect(() => {
    if (!open) {
      setTitle('')
      setExpectedDurationValue(4)
      setExpectedDurationUnit('week')
    }
  }, [open])
  if (!open) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    onCreate(value, expectedDurationValue, expectedDurationUnit)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal compact-modal" onSubmit={submit}>
        <header className="modal-header">
          <div><p className="eyebrow">课程项目</p><h2>新建课程</h2></div>
          <button className="icon-button" title="关闭" type="button" onClick={onClose}><X size={19} /></button>
        </header>
        <label className="field-label" htmlFor="project-title">课程名称</label>
        <input id="project-title" className="text-input" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：现代 C++ 系统课" />
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
        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={!title.trim()}>创建课程</button>
        </footer>
      </form>
    </div>
  )
}
