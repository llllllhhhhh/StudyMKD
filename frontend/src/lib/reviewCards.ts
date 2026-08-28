import type { AppData, ReviewCard } from '../types'

export type CardRating = 'again' | 'hard' | 'good'

export interface DueCardItem {
  projectId: string
  projectTitle: string
  chapterId: string
  chapterTitle: string
  card: ReviewCard
}

export function isCardDue(card: ReviewCard, now = Date.now()) {
  return new Date(card.dueAt).getTime() <= now
}

export function collectDueCards(data: AppData, now = Date.now()): DueCardItem[] {
  return data.projects.flatMap((project) => (
    project.chapters.flatMap((chapter) => (
      chapter.reviewCards
        .filter((card) => isCardDue(card, now))
        .map((card) => ({
          projectId: project.id,
          projectTitle: project.title,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          card,
        }))
    ))
  ))
}

export function scheduleCardDue(card: ReviewCard, rating: CardRating): ReviewCard {
  const days = rating === 'again' ? 0 : rating === 'hard' ? 2 : 5
  const due = new Date()
  due.setDate(due.getDate() + days)
  return {
    ...card,
    dueAt: due.toISOString(),
    intervalDays: days,
    repetitions: card.repetitions + 1,
  }
}
