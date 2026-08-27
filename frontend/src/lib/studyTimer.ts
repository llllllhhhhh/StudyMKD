import type { Chapter } from '../types'

export function getStudyElapsedSeconds(chapter: Chapter, now = Date.now()) {
  const savedSeconds = Math.max(0, chapter.studyElapsedSeconds ?? 0)
  if (chapter.status !== 'learning' || !chapter.studyStartedAt) return savedSeconds

  const startedAt = Date.parse(chapter.studyStartedAt)
  if (!Number.isFinite(startedAt)) return savedSeconds
  return savedSeconds + Math.max(0, Math.floor((now - startedAt) / 1000))
}

export function formatCountdown(seconds: number) {
  const absolute = Math.abs(Math.trunc(seconds))
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  const remainingSeconds = absolute % 60
  const clock = hours > 0
    ? [hours, minutes, remainingSeconds]
    : [minutes, remainingSeconds]
  return clock.map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatStudyDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  if (minutes > 0) return `${minutes} 分钟`
  return `${rounded} 秒`
}
