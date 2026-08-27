import { FormEvent, useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (title: string) => void
}

export default function NewProjectDialog({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('')
  useEffect(() => { if (!open) setTitle('') }, [open])
  if (!open) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    onCreate(value)
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
        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={!title.trim()}>创建课程</button>
        </footer>
      </form>
    </div>
  )
}
