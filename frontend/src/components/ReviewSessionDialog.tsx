import { useMemo, useState } from 'react'
import { BookOpenCheck, Check, CheckCircle2, Layers, Play, RotateCcw, Sparkles, X } from 'lucide-react'
import type { DueCardItem, CardRating } from '../lib/reviewCards'

interface Props {
  open: boolean
  items: DueCardItem[]
  onClose: () => void
  onRate: (projectId: string, chapterId: string, cardId: string, rating: CardRating) => void
}

type SessionPhase = 'overview' | 'quiz' | 'summary'

export default function ReviewSessionDialog({ open, items, onClose, onRate }: Props) {
  const [phase, setPhase] = useState<SessionPhase>('overview')
  const [queue, setQueue] = useState<DueCardItem[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState<Record<CardRating, number>>({ again: 0, hard: 0, good: 0 })

  const current = queue[index]

  const grouped = useMemo(() => {
    const groups = new Map<string, { projectTitle: string; chapterTitle: string; count: number }>()
    items.forEach((item) => {
      const key = `${item.projectId}:${item.chapterId}`
      const existing = groups.get(key)
      groups.set(key, existing
        ? { ...existing, count: existing.count + 1 }
        : { projectTitle: item.projectTitle, chapterTitle: item.chapterTitle, count: 1 })
    })
    return Array.from(groups.values())
  }, [items])

  if (!open) return null

  const startSession = () => {
    setQueue([...items])
    setIndex(0)
    setRevealed(false)
    setResults({ again: 0, hard: 0, good: 0 })
    setPhase('quiz')
  }

  const rate = (rating: CardRating) => {
    if (!current) return
    onRate(current.projectId, current.chapterId, current.card.id, rating)
    setResults((previous) => ({ ...previous, [rating]: previous[rating] + 1 }))
    if (index + 1 >= queue.length) {
      setPhase('summary')
    } else {
      setIndex(index + 1)
      setRevealed(false)
    }
  }

  const close = () => {
    setPhase('overview')
    setQueue([])
    setIndex(0)
    setRevealed(false)
    setResults({ again: 0, hard: 0, good: 0 })
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal review-modal" role="dialog" aria-modal="true" aria-label="复习卡片">
        <header className="modal-header">
          <div><p className="eyebrow">主动回忆</p><h2>复习卡片</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={close}><X size={19} /></button>
        </header>

        {phase === 'overview' && (
          <>
            <div className="review-overview">
              {!items.length ? (
                <div className="review-empty">
                  <BookOpenCheck size={30} />
                  <strong>今天没有到期的卡片</strong>
                  <span>在笔记中选中文字并点击“制成卡片”，卡片到期后会出现在这里。</span>
                </div>
              ) : (
                <>
                  <div className="review-overview-summary">
                    <CheckCircle2 size={20} />
                    <strong>{items.length} 张卡片已到期</strong>
                    <span>来自 {grouped.length} 个章节</span>
                  </div>
                  <div className="review-group-list">
                    {grouped.map((group) => (
                      <div className="review-group-row" key={`${group.projectTitle}:${group.chapterTitle}`}>
                        <Layers size={15} />
                        <span><strong>{group.chapterTitle}</strong><small>{group.projectTitle}</small></span>
                        <em>{group.count} 张</em>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <footer className="modal-footer">
              <button className="text-button" type="button" onClick={close}>关闭</button>
              <button className="primary-button" type="button" disabled={!items.length} onClick={startSession}><Play size={15} />开始复习</button>
            </footer>
          </>
        )}

        {phase === 'quiz' && current && (
          <>
            <div className="review-quiz-progress">
              <span>第 {index + 1} / {queue.length} 张</span>
              <div className="review-progress-track"><span style={{ width: `${((index) / queue.length) * 100}%` }} /></div>
            </div>
            <div className="review-quiz-card">
              <span className="review-quiz-context">{current.projectTitle} · {current.chapterTitle}</span>
              <h3 className="review-quiz-question">{current.card.question}</h3>
              {!revealed ? (
                <button className="secondary-button review-reveal" type="button" onClick={() => setRevealed(true)}><Sparkles size={15} />显示答案</button>
              ) : (
                <div className="review-quiz-answer">
                  <p>答案</p>
                  <div>{current.card.answer}</div>
                </div>
              )}
            </div>
            {revealed && (
              <div className="review-rate-row" role="group" aria-label="卡片评级">
                <button className="review-rate again" type="button" onClick={() => rate('again')}>忘记<span>今天再复习</span></button>
                <button className="review-rate hard" type="button" onClick={() => rate('hard')}>困难<span>2 天后</span></button>
                <button className="review-rate good" type="button" onClick={() => rate('good')}>掌握<span>5 天后</span></button>
              </div>
            )}
            <footer className="modal-footer">
              <button className="text-button" type="button" onClick={close}>结束复习</button>
            </footer>
          </>
        )}

        {phase === 'summary' && (
          <>
            <div className="review-summary">
              <CheckCircle2 size={30} />
              <strong>本次复习完成</strong>
              <span>共复习 {queue.length} 张卡片</span>
              <div className="review-summary-stats">
                <div className="again"><span>忘记</span><strong>{results.again}</strong></div>
                <div className="hard"><span>困难</span><strong>{results.hard}</strong></div>
                <div className="good"><span>掌握</span><strong>{results.good}</strong></div>
              </div>
            </div>
            <footer className="modal-footer">
              <button className="primary-button" type="button" onClick={close}><Check size={15} />完成</button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
