import { BookOpen, ChevronLeft, ChevronRight, Clock3, ExternalLink, Minus, Pause, Pin, PinOff, Play, X } from 'lucide-react'
import { formatCountdown, formatStudyDuration } from '../lib/studyTimer'
import type { Chapter, Screenshot } from '../types'
import NoteEditor from './NoteEditor'

interface Props {
  projectTitle: string
  chapter: Chapter
  chapterIndex: number
  chapterCount: number
  timerRemainingSeconds: number
  elapsedSeconds: number
  timerRunning: boolean
  alwaysOnTop: boolean
  collapsed: boolean
  desktop: boolean
  onPasteImage: (file: File) => Promise<Screenshot>
  onOpenScreenshot: (screenshotId: string) => void
  onNoteChange: (value: string) => void
  onVideoTimestampChange: (value: string) => void
  onToggleTimer: () => void
  onPrevious: () => void
  onNext: () => void
  onToggleAlwaysOnTop: () => void
  onShowMain: () => void
  onCollapse: () => void
  onExpand: () => void
  onClose: () => void
}

export default function FocusNoteView({
  projectTitle,
  chapter,
  chapterIndex,
  chapterCount,
  timerRemainingSeconds,
  elapsedSeconds,
  timerRunning,
  alwaysOnTop,
  collapsed,
  desktop,
  onPasteImage,
  onOpenScreenshot,
  onNoteChange,
  onVideoTimestampChange,
  onToggleTimer,
  onPrevious,
  onNext,
  onToggleAlwaysOnTop,
  onShowMain,
  onCollapse,
  onExpand,
  onClose,
}: Props) {
  if (collapsed) {
    return (
      <div className="focus-collapsed-shell">
        <button className="focus-restore-button" type="button" title="展开专注笔记" onClick={onExpand}>
          <BookOpen size={24} />
        </button>
      </div>
    )
  }

  return (
    <div className="focus-shell">
      <header className="focus-header">
        <div className="focus-title-copy">
          <span>{projectTitle}</span>
          <strong title={chapter.title}>{chapter.title}</strong>
        </div>
        <div className="focus-window-actions">
          {desktop && <button className={`icon-button ${alwaysOnTop ? 'active' : ''}`} type="button" title={alwaysOnTop ? '取消始终置顶' : '始终置顶'} onClick={onToggleAlwaysOnTop}>{alwaysOnTop ? <Pin size={16} /> : <PinOff size={16} />}</button>}
          {desktop && <button className="icon-button" type="button" title="收起到桌面右下角" onClick={onCollapse}><Minus size={17} /></button>}
          <button className="icon-button" type="button" title="返回主窗口" onClick={onShowMain}><ExternalLink size={16} /></button>
          <button className="icon-button" type="button" title="关闭小窗" onClick={onClose}><X size={17} /></button>
        </div>
      </header>

      <main className="focus-editor-area">
        <NoteEditor
          chapterId={chapter.id}
          content={chapter.noteHtml}
          onPasteImage={onPasteImage}
          onOpenScreenshot={onOpenScreenshot}
          onChange={onNoteChange}
          onSelectionChange={() => undefined}
        />
      </main>

      <footer className="focus-footer">
        <div className="focus-navigation">
          <button className="icon-button" type="button" title="上一章" disabled={chapterIndex <= 0} onClick={onPrevious}><ChevronLeft size={17} /></button>
          <span>{chapterIndex + 1}/{chapterCount}</span>
          <button className="icon-button" type="button" title="下一章" disabled={chapterIndex >= chapterCount - 1} onClick={onNext}><ChevronRight size={17} /></button>
        </div>
        <label className="focus-video-time">
          <Clock3 size={14} />
          <input aria-label="视频时间" value={chapter.videoTimestamp} onChange={(event) => onVideoTimestampChange(event.target.value)} placeholder="00:00" />
        </label>
        <div className={`focus-timer ${timerRemainingSeconds < 0 ? 'overtime' : ''}`}>
          <span>{timerRemainingSeconds < 0 ? '超时' : '剩余'} {formatCountdown(timerRemainingSeconds)}</span>
          {elapsedSeconds > 0 && <small>已学 {formatStudyDuration(elapsedSeconds)}</small>}
          <button className="icon-button" type="button" title={timerRunning ? '暂停计时' : '开始计时'} onClick={onToggleTimer}>{timerRunning ? <Pause size={16} /> : <Play size={16} />}</button>
        </div>
      </footer>
    </div>
  )
}
