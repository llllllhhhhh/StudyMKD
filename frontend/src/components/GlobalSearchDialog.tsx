import { useMemo, useRef, useState } from 'react'
import { FileText, FolderTree, Search, X } from 'lucide-react'
import type { AppData } from '../types'
import { searchAll } from '../lib/globalSearch'

interface Props {
  open: boolean
  data: AppData
  onClose: () => void
  onOpen: (projectId: string, chapterId: string) => void
}

const kindIcon: Record<string, typeof FileText> = {
  标题: FolderTree,
  笔记: FileText,
  标签: FileText,
  截图: FileText,
  回顾: FileText,
  卡片: FileText,
  视频时间: FileText,
}

export default function GlobalSearchDialog({ open, data, onClose, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchAll(data, query), [data, query])
  if (!open) return null

  const openResult = (projectId: string, chapterId: string) => {
    onOpen(projectId, chapterId)
    setQuery('')
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal search-modal" role="dialog" aria-modal="true" aria-label="全局搜索">
        <header className="modal-header">
          <div><p className="eyebrow">全局搜索</p><h2>搜索课程内容</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="global-search-input">
          <Search size={16} />
          <input
            ref={inputRef}
            autoFocus
            aria-label="全局搜索关键词"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'Enter' && results[0]) {
                openResult(results[0].projectId, results[0].chapterId)
              }
            }}
            placeholder="搜索章节、笔记、标签、截图说明、复习卡片…"
          />
          {query && <span className="global-search-count">{results.length} 条结果</span>}
        </div>

        <div className="global-search-results">
          {!query ? (
            <div className="global-search-empty"><Search size={22} /><span>输入关键词开始搜索全部课程</span></div>
          ) : !results.length ? (
            <div className="global-search-empty"><Search size={22} /><span>没有找到匹配的内容</span></div>
          ) : (
            results.map((result) => {
              const Icon = kindIcon[result.kind] ?? FileText
              return (
                <button className="global-search-row" type="button" key={`${result.projectId}:${result.chapterId}:${result.kind}:${result.snippet}`} onClick={() => openResult(result.projectId, result.chapterId)}>
                  <span className="global-search-kind"><Icon size={14} />{result.kind}</span>
                  <span className="global-search-copy">
                    <strong>{result.chapterTitle}</strong>
                    <small>{result.projectTitle}</small>
                    <em>{result.snippet}</em>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  )
}
