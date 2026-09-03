import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Clock3, Flame, Hourglass, X } from 'lucide-react'
import type { CourseProject } from '../types'
import { buildStudyStats, formatStatDuration, heatmapColor } from '../lib/studyStats'
import { formatStudyDuration } from '../lib/studyTimer'

interface Props {
  open: boolean
  project: CourseProject
  onClose: () => void
}

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

export default function StudyStatsDialog({ open, project, onClose }: Props) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [open])

  const stats = useMemo(() => buildStudyStats(project, now), [now, project])
  if (!open) return null

  const monthLabelsByColumn = new Map<number, { label: string; column: number }>()
  let previousMonth = ''
  stats.daily.forEach((day, index) => {
    const date = new Date(`${day.date}T00:00:00`)
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`
    if (monthKey === previousMonth) return
    previousMonth = monthKey
    const column = Math.floor(index / 7) + 1
    monthLabelsByColumn.set(column, { label: `${date.getMonth() + 1}月`, column })
  })
  const monthLabels = Array.from(monthLabelsByColumn.values())

  const formatHeatmapDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal stats-modal" role="dialog" aria-modal="true" aria-label="学习统计">
        <header className="modal-header">
          <div><p className="eyebrow">学习记录</p><h2>{project.title}</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="stats-body">
          <div className="stats-metrics">
            <div><Flame size={16} /><span>今日</span><strong>{formatStatDuration(stats.todaySeconds)}</strong></div>
            <div><CalendarDays size={16} /><span>本周</span><strong>{formatStatDuration(stats.weekSeconds)}</strong></div>
            <div><BarChart3 size={16} /><span>本月</span><strong>{formatStatDuration(stats.monthSeconds)}</strong></div>
            <div><Hourglass size={16} /><span>累计</span><strong>{formatStatDuration(stats.totalSeconds)}</strong></div>
          </div>

          <section className="stats-section">
            <div className="stats-section-heading"><CalendarDays size={15} /><h3>最近 12 周</h3></div>
            <div className="heatmap">
              <div className="heatmap-weekdays">
                {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
              <div className="heatmap-grid">
                {stats.daily.map((day) => (
                  <span
                    key={day.date}
                    className={`heatmap-day ${day.future ? 'future' : heatmapColor(day.seconds)}`}
                    title={day.future ? `${formatHeatmapDate(day.date)}：尚未到达` : `${formatHeatmapDate(day.date)}：${formatStudyDuration(day.seconds)}`}
                  />
                ))}
              </div>
              <div className="heatmap-months">
                {monthLabels.map((month) => (
                  <span key={month.column} style={{ gridColumnStart: month.column }}>{month.label}</span>
                ))}
              </div>
              <div className="heatmap-legend">
                <span>少</span>
                <span className="heatmap-day level-1" />
                <span className="heatmap-day level-2" />
                <span className="heatmap-day level-3" />
                <span className="heatmap-day level-4" />
                <span>多</span>
              </div>
            </div>
          </section>

          <section className="stats-section">
            <div className="stats-section-heading"><Clock3 size={15} /><h3>章节用时</h3></div>
            <div className="stats-chapter-list">
              {stats.chapters.map((chapter) => (
                <div className="stats-chapter-row" key={chapter.id}>
                  <div className="stats-chapter-copy">
                    <strong title={chapter.title}>{chapter.title}</strong>
                    <span>计划 {chapter.planMinutes} 分钟 · 实际 {formatStudyDuration(chapter.actualSeconds)}</span>
                  </div>
                  <div className="stats-chapter-bar">
                    <span style={{ width: `${chapter.progressPercent}%` }} />
                  </div>
                  <em>{chapter.progressPercent}%</em>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  )
}
