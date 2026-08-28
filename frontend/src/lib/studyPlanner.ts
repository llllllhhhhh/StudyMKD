import type { Chapter, CourseProject, StudyPlan, StudyTimeSlot } from '../types'
import { getStudyElapsedSeconds } from './studyTimer'

export interface PlannedStudySession {
  id: string
  date: string
  startTime: string
  endTime: string
  chapterId: string
  chapterTitle: string
  minutes: number
}

export interface StudyForecast {
  remainingMinutes: number
  effectiveMinutesPerWeek: number
  speedFactor: number
  completionDate: string | null
  targetDate: string | null
  targetDeltaDays: number | null
  sessions: PlannedStudySession[]
  schedulable: boolean
}

interface FocusBlock {
  startMinute: number
  endMinute: number
}

interface ChapterWork {
  chapter: Chapter
  remainingMinutes: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function localDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, Math.max(0, month - 1), day || 1)
  date.setHours(0, 0, 0, 0)
  return date
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return (hour * 60) + minute
}

function minuteToTime(value: number) {
  const normalized = Math.max(0, Math.min((24 * 60) - 1, Math.round(value)))
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function appWeekday(date: Date) {
  return date.getDay() === 0 ? 7 : date.getDay()
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function slotFocusBlocks(slot: StudyTimeSlot, plan: StudyPlan, earliestMinute = 0): FocusBlock[] {
  const start = timeToMinute(slot.startTime)
  const end = timeToMinute(slot.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []

  const blocks: FocusBlock[] = []
  let cursor = Math.max(start, earliestMinute)
  while (cursor < end) {
    const available = end - cursor
    if (available < plan.minimumSessionMinutes) break
    const focus = Math.min(plan.focusMinutes, available)
    blocks.push({ startMinute: cursor, endMinute: cursor + focus })
    cursor += focus
    if (end - cursor >= plan.breakMinutes + plan.minimumSessionMinutes) cursor += plan.breakMinutes
  }
  return blocks
}

function historicalSpeedFactor(project: CourseProject, now: number) {
  let planned = 0
  let actual = 0
  project.chapters.forEach((chapter) => {
    if (chapter.status !== 'completed') return
    const elapsedMinutes = getStudyElapsedSeconds(chapter, now) / 60
    if (elapsedMinutes <= 0 || chapter.studyPlanMinutes <= 0) return
    planned += chapter.studyPlanMinutes
    actual += elapsedMinutes
  })
  return planned > 0 ? clamp(actual / planned, 0.7, 2) : 1
}

function chapterWork(project: CourseProject, speedFactor: number, bufferPercent: number, now: number): ChapterWork[] {
  const bufferFactor = 1 + (bufferPercent / 100)
  return project.chapters.flatMap((chapter) => {
    if (chapter.status === 'completed') return []
    const expectedMinutes = chapter.studyPlanMinutes * speedFactor
    const elapsedMinutes = getStudyElapsedSeconds(chapter, now) / 60
    const remainingMinutes = Math.max(0, expectedMinutes - elapsedMinutes) * bufferFactor
    return remainingMinutes > 0 ? [{ chapter, remainingMinutes }] : []
  })
}

function targetDate(project: CourseProject, startDate: Date) {
  if (!project.expectedDurationValue || !project.expectedDurationUnit) return null
  const result = new Date(startDate)
  if (project.expectedDurationUnit === 'day') result.setDate(result.getDate() + project.expectedDurationValue)
  if (project.expectedDurationUnit === 'week') result.setDate(result.getDate() + (project.expectedDurationValue * 7))
  if (project.expectedDurationUnit === 'month') result.setMonth(result.getMonth() + project.expectedDurationValue)
  return result
}

function dateDifference(left: Date, right: Date) {
  return Math.ceil((left.getTime() - right.getTime()) / DAY_MS)
}

export function createDefaultStudyPlan(now = new Date()): StudyPlan {
  return {
    startDate: localDateString(now),
    focusMinutes: 50,
    breakMinutes: 10,
    minimumSessionMinutes: 25,
    bufferPercent: 15,
    weeklySlots: [],
  }
}

export function normalizeStudyPlan(plan: StudyPlan): StudyPlan {
  const focusMinutes = clamp(Math.round(plan.focusMinutes || 50), 10, 180)
  return {
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(plan.startDate) ? plan.startDate : localDateString(new Date()),
    focusMinutes,
    breakMinutes: clamp(Math.round(plan.breakMinutes || 0), 0, 60),
    minimumSessionMinutes: clamp(Math.round(plan.minimumSessionMinutes || 25), 5, focusMinutes),
    bufferPercent: clamp(Math.round(plan.bufferPercent || 0), 0, 100),
    weeklySlots: (plan.weeklySlots ?? []).map((slot) => ({
      id: slot.id || crypto.randomUUID(),
      weekday: clamp(Math.round(slot.weekday || 1), 1, 7),
      startTime: slot.startTime || '19:00',
      endTime: slot.endTime || '21:00',
    })),
  }
}

export function isValidStudyTimeSlot(slot: StudyTimeSlot) {
  return timeToMinute(slot.endTime) > timeToMinute(slot.startTime)
}

export function buildStudyForecast(project: CourseProject, planInput: StudyPlan, now = Date.now()): StudyForecast {
  const plan = normalizeStudyPlan(planInput)
  const speedFactor = historicalSpeedFactor(project, now)
  const work = chapterWork(project, speedFactor, plan.bufferPercent, now)
  const remainingMinutes = Math.ceil(work.reduce((total, item) => total + item.remainingMinutes, 0))
  const effectiveMinutesPerWeek = plan.weeklySlots.reduce((total, slot) => (
    total + slotFocusBlocks(slot, plan).reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
  ), 0)

  const today = new Date(now)
  const currentMinute = (today.getHours() * 60) + today.getMinutes() + (today.getSeconds() > 0 ? 1 : 0)
  today.setHours(0, 0, 0, 0)
  const configuredStart = parseLocalDate(plan.startDate)
  const scheduleStart = configuredStart > today ? configuredStart : today
  const courseTargetDate = targetDate(project, configuredStart)

  if (!remainingMinutes) {
    return {
      remainingMinutes: 0,
      effectiveMinutesPerWeek,
      speedFactor,
      completionDate: localDateString(today),
      targetDate: courseTargetDate ? localDateString(courseTargetDate) : null,
      targetDeltaDays: courseTargetDate ? dateDifference(today, courseTargetDate) : null,
      sessions: [],
      schedulable: true,
    }
  }

  if (!effectiveMinutesPerWeek) {
    return {
      remainingMinutes,
      effectiveMinutesPerWeek: 0,
      speedFactor,
      completionDate: null,
      targetDate: courseTargetDate ? localDateString(courseTargetDate) : null,
      targetDeltaDays: null,
      sessions: [],
      schedulable: false,
    }
  }

  const queue = work.map((item) => ({ ...item }))
  const sessions: PlannedStudySession[] = []
  let completionDate: Date | null = null

  for (let offset = 0; offset < 3660 && queue.length; offset += 1) {
    const date = new Date(scheduleStart)
    date.setDate(scheduleStart.getDate() + offset)
    const slots = plan.weeklySlots
      .filter((slot) => slot.weekday === appWeekday(date) && isValidStudyTimeSlot(slot))
      .sort((left, right) => left.startTime.localeCompare(right.startTime))

    for (const slot of slots) {
      const earliestMinute = date.getTime() === today.getTime() ? currentMinute : 0
      for (const block of slotFocusBlocks(slot, plan, earliestMinute)) {
        let cursor = block.startMinute
        let available = block.endMinute - block.startMinute
        while (available > 0 && queue.length) {
          const current = queue[0]
          if (available < plan.minimumSessionMinutes && current.remainingMinutes > available) break
          let minutes = Math.min(available, current.remainingMinutes)
          const remainderAfterFullBlock = current.remainingMinutes - available
          if (remainderAfterFullBlock > 0 && remainderAfterFullBlock < plan.minimumSessionMinutes) {
            minutes = current.remainingMinutes - plan.minimumSessionMinutes
          }
          if (minutes < plan.minimumSessionMinutes && current.remainingMinutes >= plan.minimumSessionMinutes) break
          const roundedMinutes = Math.max(1, Math.ceil(minutes))
          sessions.push({
            id: `${localDateString(date)}-${slot.id}-${cursor}-${current.chapter.id}`,
            date: localDateString(date),
            startTime: minuteToTime(cursor),
            endTime: minuteToTime(cursor + roundedMinutes),
            chapterId: current.chapter.id,
            chapterTitle: current.chapter.title,
            minutes: roundedMinutes,
          })
          current.remainingMinutes -= minutes
          cursor += roundedMinutes
          available -= minutes
          if (current.remainingMinutes <= 0.01) queue.shift()
        }
        if (!queue.length) {
          completionDate = date
          break
        }
      }
      if (!queue.length) break
    }
  }

  const delta = completionDate && courseTargetDate ? dateDifference(completionDate, courseTargetDate) : null
  return {
    remainingMinutes,
    effectiveMinutesPerWeek,
    speedFactor,
    completionDate: completionDate ? localDateString(completionDate) : null,
    targetDate: courseTargetDate ? localDateString(courseTargetDate) : null,
    targetDeltaDays: delta,
    sessions: sessions.slice(0, 12),
    schedulable: Boolean(completionDate),
  }
}

export function formatPlannerDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(parseLocalDate(value))
}
