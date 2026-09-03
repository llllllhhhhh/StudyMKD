import { useEffect, useMemo, useState } from 'react'
import { Brain, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Eye, RotateCcw, X } from 'lucide-react'
import type { CardRating } from '../lib/reviewCards'
import type { Chapter } from '../types'

interface Props {
  projectTitle: string
  chapter: Chapter
  desktop: boolean
  onRate: (cardId: string, rating: CardRating) => void
  onShowMain: () => void
  onClose: () => void
}

export default function FocusReviewView({ projectTitle, chapter, desktop, onRate, onShowMain, onClose }: Props) {
  const [cardIds, setCardIds] = useState(() => chapter.reviewCards.map((card) => card.id))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [revealed, setRevealed] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    setCardIds(chapter.reviewCards.map((card) => card.id))
    setCurrentIndex(0)
    setCompletedIds(new Set())
    setRevealed(false)
    setFinished(false)
  }, [chapter.id])

  const cards = useMemo(() => cardIds
    .map((id) => chapter.reviewCards.find((card) => card.id === id))
    .filter((card): card is Chapter['reviewCards'][number] => Boolean(card)), [cardIds, chapter.reviewCards])
  const safeIndex = Math.min(currentIndex, Math.max(0, cards.length - 1))
  const currentCard = cards[safeIndex]
  const progress = cards.length ? Math.round((completedIds.size / cards.length) * 100) : 0

  const move = (direction: -1 | 1) => {
    setCurrentIndex((current) => Math.max(0, Math.min(cards.length - 1, current + direction)))
    setRevealed(false)
  }

  const rate = (rating: CardRating) => {
    if (!currentCard || !revealed) return
    onRate(currentCard.id, rating)
    const nextCompleted = new Set(completedIds)
    nextCompleted.add(currentCard.id)
    setCompletedIds(nextCompleted)
    setRevealed(false)
    if (nextCompleted.size >= cards.length) {
      setFinished(true)
      return
    }
    const nextIndex = cards.findIndex((card, index) => index > safeIndex && !nextCompleted.has(card.id))
    setCurrentIndex(nextIndex >= 0 ? nextIndex : cards.findIndex((card) => !nextCompleted.has(card.id)))
  }

  const restart = () => {
    setCardIds(chapter.reviewCards.map((card) => card.id))
    setCurrentIndex(0)
    setCompletedIds(new Set())
    setRevealed(false)
    setFinished(false)
  }

  return (
    <div className="focus-review-shell">
      <header className="focus-review-header">
        <div className="focus-review-title">
          <Brain size={18} />
          <span><small>{projectTitle}</small><strong>{chapter.title}</strong></span>
        </div>
        <div className="focus-window-actions">
          <button className="icon-button" type="button" title="返回主窗口" onClick={onShowMain}><ExternalLink size={16} /></button>
          <button className="icon-button" type="button" title="关闭专注复习" onClick={onClose}><X size={17} /></button>
        </div>
      </header>

      <main className="focus-review-main">
        {!cards.length ? (
          <div className="focus-review-empty"><Brain size={30} /><strong>暂无复习卡片</strong></div>
        ) : finished ? (
          <div className="focus-review-finished">
            <CheckCircle2 size={36} />
            <strong>本轮复习完成</strong>
            <span>已复习 {completedIds.size} 张卡片</span>
            <button className="secondary-button" type="button" onClick={restart}><RotateCcw size={15} />再复习一轮</button>
          </div>
        ) : (
          <>
            <div className="focus-review-progress">
              <span>{completedIds.size}/{cards.length}</span>
              <div><i style={{ width: `${progress}%` }} /></div>
              <em>{safeIndex + 1}/{cards.length}</em>
            </div>
            <article className="focus-review-card">
              <p className="eyebrow">问题</p>
              <h1>{currentCard.question}</h1>
              {!!currentCard.tags?.length && <div className="focus-review-tags">{currentCard.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
              {!revealed ? (
                <button className="primary-button focus-review-reveal" type="button" onClick={() => setRevealed(true)}><Eye size={16} />显示答案</button>
              ) : (
                <div className="focus-review-answer"><p className="eyebrow">答案</p><div>{currentCard.answer}</div></div>
              )}
            </article>
          </>
        )}
      </main>

      {!!cards.length && !finished && (
        <footer className="focus-review-footer">
          <div className="focus-review-nav">
            <button className="icon-button" type="button" title="上一张" disabled={safeIndex <= 0} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
            <button className="icon-button" type="button" title="下一张" disabled={safeIndex >= cards.length - 1} onClick={() => move(1)}><ChevronRight size={18} /></button>
          </div>
          <div className="focus-review-rates">
            <button className="review-rate again" type="button" disabled={!revealed} onClick={() => rate('again')}><strong>忘记</strong><span>今天</span></button>
            <button className="review-rate hard" type="button" disabled={!revealed} onClick={() => rate('hard')}><strong>困难</strong><span>2 天后</span></button>
            <button className="review-rate good" type="button" disabled={!revealed} onClick={() => rate('good')}><strong>掌握</strong><span>5 天后</span></button>
          </div>
        </footer>
      )}
      {!desktop && <span className="focus-review-browser-note">浏览器小窗</span>}
    </div>
  )
}
