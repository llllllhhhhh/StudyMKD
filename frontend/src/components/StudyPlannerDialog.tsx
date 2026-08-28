import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  HelpCircle,
  Plus,
  Target,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  buildStudyForecast,
  createDefaultStudyPlan,
  formatPlannerDate,
  isValidStudyTimeSlot,
  normalizeStudyPlan,
} from '../lib/studyPlanner'
import { formatStudyDuration } from '../lib/studyTimer'
import type { CourseProject, ExpectedDurationUnit, StudyPlan, StudyTimeSlot } from '../types'

interface Props {
  open: boolean
  project: CourseProject
  onClose: () => void
  onSave: (plan: StudyPlan, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => void
}

const weekdayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
]

function copyPlan(plan: StudyPlan) {
  return { ...plan, weeklySlots: plan.weeklySlots.map((slot) => ({ ...slot })) }
}

function targetStatus(delta: number | null) {
  if (delta === null) return null
  if (delta < 0) return { tone: 'good', label: `预计提前 ${Math.abs(delta)} 天完成` }
  if (delta === 0) return { tone: 'good', label: '预计可按期完成' }
  return { tone: 'late', label: `预计晚于目标 ${delta} 天` }
}

function formatPlannerMinutes(minutes: number) {
  return minutes > 0 ? formatStudyDuration(minutes * 60) : '0 分钟'
}

export default function StudyPlannerDialog({ open, project, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<StudyPlan>(() => copyPlan(project.studyPlan ?? createDefaultStudyPlan()))
  const [expectedDurationValue, setExpectedDurationValue] = useState(project.expectedDurationValue ?? 4)
  const [expectedDurationUnit, setExpectedDurationUnit] = useState<ExpectedDurationUnit>(project.expectedDurationUnit ?? 'week')
  const [forecastNow, setForecastNow] = useState(Date.now())
  const [rhythmHelpOpen, setRhythmHelpOpen] = useState(false)
  const rhythmHelp = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft(copyPlan(project.studyPlan ?? createDefaultStudyPlan()))
    setExpectedDurationValue(project.expectedDurationValue ?? 4)
    setExpectedDurationUnit(project.expectedDurationUnit ?? 'week')
    setRhythmHelpOpen(false)
    setForecastNow(Date.now())
  }, [open, project.expectedDurationUnit, project.expectedDurationValue, project.id, project.studyPlan])

  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => setForecastNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!rhythmHelpOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rhythmHelp.current?.contains(event.target as Node)) setRhythmHelpOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRhythmHelpOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [rhythmHelpOpen])

  const forecastProject = useMemo(() => ({
    ...project,
    expectedDurationValue,
    expectedDurationUnit,
  }), [expectedDurationUnit, expectedDurationValue, project])
  const forecast = useMemo(() => buildStudyForecast(forecastProject, draft, forecastNow), [draft, forecastNow, forecastProject])
  const invalidSlots = draft.weeklySlots.filter((slot) => !isValidStudyTimeSlot(slot))
  const target = targetStatus(forecast.targetDeltaDays)

  if (!open) return null

  const updateDraft = <Key extends keyof StudyPlan>(key: Key, value: StudyPlan[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const updateSlot = (id: string, patch: Partial<StudyTimeSlot>) => {
    setDraft((current) => ({
      ...current,
      weeklySlots: current.weeklySlots.map((slot) => slot.id === id ? { ...slot, ...patch } : slot),
    }))
  }

  const addSlot = () => {
    setDraft((current) => {
      const previousWeekday = current.weeklySlots.at(-1)?.weekday ?? 0
      return {
        ...current,
        weeklySlots: [...current.weeklySlots, {
          id: crypto.randomUUID(),
          weekday: (previousWeekday % 7) + 1,
          startTime: '19:00',
          endTime: '21:00',
        }],
      }
    })
  }

  const removeSlot = (id: string) => {
    setDraft((current) => ({ ...current, weeklySlots: current.weeklySlots.filter((slot) => slot.id !== id) }))
  }

  const save = () => {
    if (invalidSlots.length) return
    onSave(normalizeStudyPlan(draft), expectedDurationValue, expectedDurationUnit)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal planner-modal" role="dialog" aria-modal="true" aria-label="学习计划">
        <header className="modal-header planner-header">
          <div><p className="eyebrow">课程规划</p><h2>{project.title}</h2></div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="planner-body">
          <div className="planner-settings">
            <section className="planner-section">
              <div className="planner-section-heading"><CalendarDays size={16} /><h3>计划范围</h3></div>
              <label className="planner-field">
                <span>开始日期</span>
                <input type="date" value={draft.startDate} onChange={(event) => updateDraft('startDate', event.target.value)} />
              </label>
              <label className="planner-field planner-target-field">
                <span>目标周期</span>
                <div>
                  <input type="number" min="1" max="999" value={expectedDurationValue} onChange={(event) => setExpectedDurationValue(Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 1))))} />
                  <select value={expectedDurationUnit} onChange={(event) => setExpectedDurationUnit(event.target.value as ExpectedDurationUnit)}>
                    <option value="day">天</option>
                    <option value="week">周</option>
                    <option value="month">月</option>
                  </select>
                </div>
              </label>
            </section>

            <section className="planner-section">
              <div className="planner-section-heading"><Clock3 size={16} /><h3>每周可用时间</h3></div>
              <div className="weekly-slot-list">
                {draft.weeklySlots.map((slot) => (
                  <div className={`weekly-slot-row ${isValidStudyTimeSlot(slot) ? '' : 'invalid'}`} key={slot.id}>
                    <select aria-label="星期" value={slot.weekday} onChange={(event) => updateSlot(slot.id, { weekday: Number(event.target.value) })}>
                      {weekdayOptions.map((weekday) => <option key={weekday.value} value={weekday.value}>{weekday.label}</option>)}
                    </select>
                    <input aria-label="开始时间" type="time" value={slot.startTime} onChange={(event) => updateSlot(slot.id, { startTime: event.target.value })} />
                    <span>至</span>
                    <input aria-label="结束时间" type="time" value={slot.endTime} onChange={(event) => updateSlot(slot.id, { endTime: event.target.value })} />
                    <button className="icon-button danger" type="button" title="删除时段" onClick={() => removeSlot(slot.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
                {!draft.weeklySlots.length && <div className="planner-quiet-empty"><CalendarClock size={20} /><span>暂无可学习时段</span></div>}
              </div>
              <button className="secondary-button full-width" type="button" onClick={addSlot}><Plus size={15} />添加时段</button>
            </section>

            <section className="planner-section">
              <div className="planner-section-heading planner-heading-with-help" ref={rhythmHelp}>
                <Gauge size={16} /><h3>学习节奏</h3>
                <button
                  className={`planner-help-button ${rhythmHelpOpen ? 'active' : ''}`}
                  type="button"
                  aria-label="学习节奏说明"
                  aria-expanded={rhythmHelpOpen}
                  onClick={() => setRhythmHelpOpen((current) => !current)}
                >
                  <HelpCircle size={15} />
                </button>
              </div>
              {rhythmHelpOpen && (
                <div className="planner-rhythm-help" role="note" onPointerDown={(event) => event.stopPropagation()}>
                  <p><strong>专注：</strong>一次连续学习最多安排多久。</p>
                  <p><strong>休息：</strong>两个专注段之间预留的时间，会减少每周有效学习时间。</p>
                  <p><strong>最短学习：</strong>剩余时间不足该数值时，不再开启新的学习段。</p>
                    <p><strong>缓冲：</strong>在程序算出的“预计剩余学习时间”上额外预留时间。例如预计还需 100 分钟，设置 15% 后会按 115 分钟排期。它只影响完成日期和学习安排，不修改章节计划时间或实际计时。</p>
                </div>
              )}
              <div className="planner-number-grid">
                <label><span>专注</span><input type="number" min="10" max="180" value={draft.focusMinutes} onChange={(event) => updateDraft('focusMinutes', Number(event.target.value))} /><small>分钟</small></label>
                <label><span>休息</span><input type="number" min="0" max="60" value={draft.breakMinutes} onChange={(event) => updateDraft('breakMinutes', Number(event.target.value))} /><small>分钟</small></label>
                <label><span>最短学习</span><input type="number" min="5" max="120" value={draft.minimumSessionMinutes} onChange={(event) => updateDraft('minimumSessionMinutes', Number(event.target.value))} /><small>分钟</small></label>
                <label><span>缓冲</span><input type="number" min="0" max="100" value={draft.bufferPercent} onChange={(event) => updateDraft('bufferPercent', Number(event.target.value))} /><small>%</small></label>
              </div>
            </section>
          </div>

          <main className="planner-analysis">
            <div className="planner-analysis-heading">
              <div><p className="eyebrow">动态预测</p><h3>完成时间分析</h3></div>
              {target && <span className={`target-status ${target.tone}`}><Target size={13} />{target.label}</span>}
            </div>

            <div className="forecast-metrics">
              <div><span>剩余学习</span><strong>{formatPlannerMinutes(forecast.remainingMinutes)}</strong></div>
              <div><span>每周有效</span><strong>{formatPlannerMinutes(forecast.effectiveMinutesPerWeek)}</strong></div>
              <div><span>预计完成</span><strong>{forecast.completionDate ? formatPlannerDate(forecast.completionDate) : '--'}</strong></div>
              <div><span>速度修正</span><strong>{forecast.speedFactor.toFixed(2)}x</strong></div>
            </div>

            {forecast.targetDate && (
              <div className="planner-target-row">
                <span>目标日期</span>
                <strong>{formatPlannerDate(forecast.targetDate)}</strong>
              </div>
            )}

            {!forecast.schedulable ? (
              <div className="forecast-empty"><CalendarClock size={28} /><strong>等待可用时间</strong><span>添加每周时段后生成完成日期</span></div>
            ) : forecast.remainingMinutes === 0 ? (
              <div className="forecast-empty complete"><CheckCircle2 size={28} /><strong>课程已完成</strong></div>
            ) : (
              <section className="schedule-section">
                <div className="planner-section-heading"><CalendarClock size={16} /><h3>最近学习安排</h3></div>
                <div className="schedule-list">
                  {forecast.sessions.map((session) => (
                    <div className="schedule-row" key={session.id}>
                      <div><strong>{formatPlannerDate(session.date)}</strong><span>{session.startTime}–{session.endTime}</span></div>
                      <p>{session.chapterTitle}</p>
                      <small>{session.minutes} 分钟</small>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>

        <footer className="modal-footer planner-footer">
          <span className={invalidSlots.length ? 'planner-validation-error' : ''}>
            {invalidSlots.length ? <><TriangleAlert size={14} />结束时间需晚于开始时间</> : '预测随章节进度和实际计时自动更新'}
          </span>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="button" disabled={Boolean(invalidSlots.length)} onClick={save}>保存计划</button>
        </footer>
      </section>
    </div>
  )
}
