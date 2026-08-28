import type { Chapter, CourseProject, StudySegment } from '../types'
import { getStudyElapsedSeconds } from './studyTimer'

const DAY_MS = 24 * 60 * 60 * 1000

function localDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, Math.max(0, month - 1), day || 1)
}

/**
 * 结束一次进行中的学习计时，返回追加片段后的章节字段。
 * 仅在章节处于 learning 且存在开始时间时生成片段；不足 1 秒的片段会被忽略。
 */
export function commitStudySegment(
  chapter: Chapter,
  now = Date.now(),
): { segments: StudySegment[]; startedAt: string | null } {
  const segments = [...(chapter.studySegments ?? [])]
  if (chapter.status !== 'learning' || !chapter.studyStartedAt) {
    return { segments, startedAt: null }
  }
  const startedAt = Date.parse(chapter.studyStartedAt)
  if (!Number.isFinite(startedAt)) return { segments, startedAt: null }
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (seconds < 1) return { segments, startedAt: null }
  segments.push({ start: chapter.studyStartedAt, end: new Date(now).toISOString(), seconds })
  return { segments, startedAt: null }
}

export function studySecondsByDate(segments: StudySegment[]) {
  const daily = new Map<string, number>()
  segments.forEach((segment) => {
    const date = localDateString(new Date(segment.start))
    daily.set(date, (daily.get(date) ?? 0) + Math.max(0, Math.round(segment.seconds)))
  })
  return daily
}

export interface ChapterStudyStat {
  id: string
  title: string
  status: Chapter['status']
  planMinutes: number
  actualSeconds: number
  progressPercent: number
}

export interface StudyStats {
  todaySeconds: number
  weekSeconds: number
  monthSeconds: number
  totalSeconds: number
  /** 最近 84 天（12 周），按日期升序，0 表示无记录 */
  daily: Array<{ date: string; seconds: number }>
  chapters: ChapterStudyStat[]
}

export function buildStudyStats(project: CourseProject, now = Date.now()): StudyStats {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const weekStart = new Date(today)
  const weekday = today.getDay() === 0 ? 7 : today.getDay()
  weekStart.setDate(today.getDate() - (weekday - 1))

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const chapterStats: ChapterStudyStat[] = []
  let totalSeconds = 0

  project.chapters.forEach((chapter) => {
    const actualSeconds = getStudyElapsedSeconds(chapter, now)
    totalSeconds += actualSeconds
    const planSeconds = chapter.studyPlanMinutes * 60
    const progressPercent = planSeconds > 0
      ? Math.min(100, Math.round((actualSeconds / planSeconds) * 100))
      : 0
    chapterStats.push({
      id: chapter.id,
      title: chapter.title,
      status: chapter.status,
      planMinutes: chapter.studyPlanMinutes,
      actualSeconds,
      progressPercent,
    })
  })

  const dailyMap = studySecondsByDate(project.chapters.flatMap((chapter) => chapter.studySegments ?? []))
  const daily: Array<{ date: string; seconds: number }> = []
  for (let offset = 83; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const key = localDateString(date)
    daily.push({ date: key, seconds: dailyMap.get(key) ?? 0 })
  }

  const inRange = (date: Date, start: Date, end: Date) => date >= start && date < end
  const inWeek = (start: string) => {
    const date = new Date(start)
    return inRange(date, weekStart, new Date(weekStart.getTime() + 7 * DAY_MS))
  }
  const inMonth = (start: string) => {
    const date = new Date(start)
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    return inRange(date, monthStart, nextMonth)
  }

  let todaySeconds = 0
  let weekSeconds = 0
  let monthSeconds = 0
  const todayKey = localDateString(today)
  dailyMap.forEach((seconds, start) => {
    if (start === todayKey) todaySeconds += seconds
    if (inWeek(start)) weekSeconds += seconds
    if (inMonth(start)) monthSeconds += seconds
  })

  return { todaySeconds, weekSeconds, monthSeconds, totalSeconds, daily, chapters: chapterStats }
}

export function heatmapColor(seconds: number) {
  const minutes = seconds / 60
  if (minutes <= 0) return ''
  if (minutes < 15) return 'level-1'
  if (minutes < 30) return 'level-2'
  if (minutes < 60) return 'level-3'
  return 'level-4'
}

export function formatStatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分钟`
  return `${rounded} 秒`
}
