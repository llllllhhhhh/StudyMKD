import { ChangeEvent, useMemo, useRef, useState } from 'react'
import { Check, CircleAlert, Download, FileInput, Sparkles, Tags, TriangleAlert, X } from 'lucide-react'
import { buildCardSource, exportCardSource, normalizeCardQuestion, parseGeneratedCards, type GeneratedCardDraft } from '../lib/cardExchange'
import type { Chapter, CourseProject } from '../types'

interface CardDraft extends GeneratedCardDraft {
  id: string
}

export type CardImportMode = 'append' | 'replace'

interface Props {
  open: boolean
  project: CourseProject
  chapter: Chapter
  onClose: () => void
  onImport: (cards: GeneratedCardDraft[], mode: CardImportMode) => void
}

export default function CardImportDialog({ open, project, chapter, onClose, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [cards, setCards] = useState<CardDraft[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [duplicateInFileCount, setDuplicateInFileCount] = useState(0)
  const [sourceChanged, setSourceChanged] = useState(false)
  const [error, setError] = useState('')
  const [exported, setExported] = useState(false)
  const [importMode, setImportMode] = useState<CardImportMode>('append')

  const existingQuestions = useMemo(() => new Set(chapter.reviewCards.map((card) => normalizeCardQuestion(card.question))), [chapter.reviewCards])
  const isExisting = (card: CardDraft) => existingQuestions.has(normalizeCardQuestion(card.question))
  const isBlocked = (card: CardDraft) => importMode === 'append' && isExisting(card)
  const importableCards = cards.filter((card) => selectedIds.has(card.id) && !isBlocked(card))
  const existingCount = cards.filter(isExisting).length

  if (!open) return null

  const reset = () => {
    setFileName('')
    setCards([])
    setSelectedIds(new Set())
    setDuplicateInFileCount(0)
    setSourceChanged(false)
    setError('')
    setExported(false)
    setImportMode('append')
  }

  const close = () => {
    reset()
    onClose()
  }

  const exportSource = async () => {
    setError('')
    try {
      await exportCardSource(project, chapter)
      setExported(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '笔记素材导出失败')
    }
  }

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setFileName(file.name)
    setDuplicateInFileCount(0)
    setSourceChanged(false)
    if (file.size > 2 * 1024 * 1024) {
      setError('卡片文件过大（超过 2 MB）')
      return
    }
    try {
      const parsed = parseGeneratedCards(await file.text(), project, chapter)
      const currentSource = await buildCardSource(project, chapter)
      const nextCards = parsed.cards.map((card) => ({ ...card, id: crypto.randomUUID() }))
      setCards(nextCards)
      setSelectedIds(new Set(nextCards.filter((card) => importMode === 'replace' || !existingQuestions.has(normalizeCardQuestion(card.question))).map((card) => card.id)))
      setDuplicateInFileCount(parsed.duplicateInFileCount)
      setSourceChanged(parsed.file.source.contentHash !== currentSource.note.contentHash)
    } catch (reason) {
      setCards([])
      setSelectedIds(new Set())
      setError(reason instanceof Error ? reason.message : '卡片文件解析失败')
    }
  }

  const updateCard = (id: string, patch: Partial<GeneratedCardDraft>) => {
    setCards((current) => current.map((card) => card.id === id ? { ...card, ...patch } : card))
  }

  const toggleCard = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const available = cards.filter((card) => !isBlocked(card))
    const allSelected = available.length > 0 && available.every((card) => selectedIds.has(card.id))
    setSelectedIds(allSelected ? new Set() : new Set(available.map((card) => card.id)))
  }

  const changeImportMode = (mode: CardImportMode) => {
    setImportMode(mode)
    const available = mode === 'replace' ? cards : cards.filter((card) => !isExisting(card))
    setSelectedIds(new Set(available.map((card) => card.id)))
  }

  const confirmImport = () => {
    const ready = importableCards
      .map(({ question, answer, sourceExcerpt, tags }) => ({ question: question.trim(), answer: answer.trim(), sourceExcerpt, tags }))
      .filter((card) => card.question && card.answer)
    if (!ready.length) return
    onImport(ready, importMode)
    close()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal card-import-modal" role="dialog" aria-modal="true" aria-label="AI 制作复习卡片">
        <header className="modal-header">
          <div><p className="eyebrow">当前章节</p><h2>AI 制作复习卡片</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={close}><X size={19} /></button>
        </header>

        <div className="card-import-body">
          <div className="card-exchange-actions">
            <div className="card-exchange-context"><Sparkles size={18} /><span><strong>{chapter.title}</strong><small>{project.title}</small></span></div>
            <button className="secondary-button" type="button" onClick={() => void exportSource()}><Download size={15} />导出笔记素材</button>
            <input ref={inputRef} type="file" accept="application/json,.json,.studymkd-cards.json" hidden onChange={(event) => void chooseFile(event)} />
            <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}><FileInput size={15} />导入生成卡片</button>
          </div>

          {exported && <p className="card-exchange-message success"><Check size={14} />笔记素材已导出</p>}
          {error && <p className="error-message card-import-error"><TriangleAlert size={14} />{error}</p>}
          {sourceChanged && <p className="card-exchange-message warning"><CircleAlert size={14} />生成卡片后笔记内容发生过变化</p>}

          {cards.length > 0 && (
            <>
              <div className="card-import-summary">
                <span title={fileName}>{fileName}</span>
                <small>{cards.length} 张卡片</small>
                {existingCount > 0 && <small>{existingCount} 张已存在</small>}
                {duplicateInFileCount > 0 && <small>{duplicateInFileCount} 张文件内重复</small>}
                <button className="text-button" type="button" onClick={toggleAll}>全选/取消</button>
              </div>
              <div className="card-import-mode-row">
                <span>导入方式</span>
                <div className="import-mode-control" role="group" aria-label="卡片导入方式">
                  <button className={importMode === 'append' ? 'active' : ''} type="button" onClick={() => changeImportMode('append')}>追加</button>
                  <button className={importMode === 'replace' ? 'active danger-mode' : ''} type="button" onClick={() => changeImportMode('replace')}>覆盖当前</button>
                </div>
              </div>
              <div className="card-import-list">
                {cards.map((card, index) => {
                  const duplicate = isExisting(card)
                  const blocked = isBlocked(card)
                  return (
                    <article className={`card-import-item ${blocked ? 'duplicate' : ''}`} key={card.id}>
                      <label className="card-import-check">
                        <input type="checkbox" checked={!blocked && selectedIds.has(card.id)} disabled={blocked} onChange={() => toggleCard(card.id)} />
                        <span>{blocked ? '已存在' : duplicate ? `卡片 ${index + 1} · 将覆盖同题卡` : `卡片 ${index + 1}`}</span>
                      </label>
                      <label>问题<input value={card.question} onChange={(event) => updateCard(card.id, { question: event.target.value })} /></label>
                      <label>答案<textarea value={card.answer} onChange={(event) => updateCard(card.id, { answer: event.target.value })} /></label>
                      <label className="card-import-tags"><Tags size={13} /><input aria-label="卡片标签" value={card.tags?.join('、') ?? ''} onChange={(event) => updateCard(card.id, { tags: event.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean) })} placeholder="标签" /></label>
                      {card.sourceExcerpt && <blockquote>{card.sourceExcerpt}</blockquote>}
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={close}>取消</button>
          <button className={`primary-button ${importMode === 'replace' ? 'replace-import-button' : ''}`} type="button" disabled={!importableCards.length} onClick={confirmImport}>{importMode === 'replace' ? '覆盖为' : '追加'} {importableCards.length} 张卡片</button>
        </footer>
      </section>
    </div>
  )
}
