import { ChangeEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignLeft,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  Download,
  Eye,
  File as FileIcon,
  FileImage,
  Files,
  FolderOpen,
  FolderUp,
  FolderTree,
  HelpCircle,
  ImagePlus,
  Lightbulb,
  Menu,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import CatalogDialog, { type CatalogImportMode } from './components/CatalogDialog'
import AttachmentViewer from './components/AttachmentViewer'
import AttachmentImportDialog, { type AttachmentImportKind, type AttachmentStorageMode } from './components/AttachmentImportDialog'
import NewProjectDialog from './components/NewProjectDialog'
import NoteEditor from './components/NoteEditor'
import { createChapter, createProject, getInitialData, makeId } from './lib/data'
import { isBlankPlaceholder, mergeCatalogChapters, removeChapterFromList } from './lib/catalog'
import { exportProject } from './lib/exportMarkdown'
import { formatFileSize } from './lib/fileUtils'
import { deleteManagedAttachment, materializeChapterFiles, revealManagedPath } from './lib/nativeBridge'
import { loadData, saveData } from './lib/storage'
import { formatCountdown, formatStudyDuration, getStudyElapsedSeconds } from './lib/studyTimer'
import type { AppData, Chapter, ChapterAttachment, CourseProject, ExpectedDurationUnit, HighlightKind, ReviewCard, Screenshot, StudyStatus } from './types'

const ImageAnnotator = lazy(() => import('./components/ImageAnnotator'))

const statusMeta: Record<StudyStatus, { label: string; icon: typeof Circle }> = {
  not_started: { label: '未开始', icon: Circle },
  learning: { label: '学习中', icon: Clock3 },
  completed: { label: '已完成', icon: Check },
}

const flagMeta: Record<HighlightKind, { label: string; icon: typeof Target }> = {
  key: { label: '重点', icon: Target },
  question: { label: '有疑问', icon: HelpCircle },
  review: { label: '待复习', icon: RotateCcw },
  practice: { label: '可实践', icon: Lightbulb },
  mastered: { label: '已掌握', icon: BadgeCheck },
}

const expectedDurationUnitLabel: Record<ExpectedDurationUnit, string> = {
  day: '天',
  week: '周',
  month: '月',
}

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = reject
  reader.readAsDataURL(file)
})

function formatUpdated(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function App() {
  const [data, setData] = useState<AppData>()
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [mobileOutlineOpen, setMobileOutlineOpen] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [toast, setToast] = useState('')
  const [editingCardId, setEditingCardId] = useState('')
  const [cardDraft, setCardDraft] = useState({ question: '', answer: '' })
  const [editingScreenshot, setEditingScreenshot] = useState<Screenshot>()
  const [attachmentViewerId, setAttachmentViewerId] = useState<string | null>(null)
  const [attachmentImportKind, setAttachmentImportKind] = useState<AttachmentImportKind | null>(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const screenshotInput = useRef<HTMLInputElement>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    loadData().then((saved) => setData(saved ?? getInitialData()))
  }, [])

  useEffect(() => {
    if (!data) return
    const timer = window.setTimeout(() => {
      void saveData(data).catch(() => setToast('本地存储空间不足，文件未能保存'))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [data])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    setEditingCardId('')
    setAttachmentViewerId(null)
  }, [data?.activeChapterId])

  const project = data?.projects.find((item) => item.id === data.activeProjectId)
  const chapter = project?.chapters.find((item) => item.id === data?.activeChapterId)

  const dueCards = useMemo(() => {
    if (!data) return 0
    const now = Date.now()
    return data.projects.flatMap((item) => item.chapters).flatMap((item) => item.reviewCards).filter((card) => new Date(card.dueAt).getTime() <= now).length
  }, [data])

  const hasRunningTimer = useMemo(() => Boolean(data?.projects.some((item) => (
    item.chapters.some((chapterItem) => chapterItem.status === 'learning' && chapterItem.studyStartedAt)
  ))), [data])

  useEffect(() => {
    if (!hasRunningTimer) return
    setClockNow(Date.now())
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasRunningTimer])

  if (!data || !project) {
    return <div className="loading-screen"><BookOpen size={25} /><span>正在打开课程…</span></div>
  }

  const mutateProject = (projectId: string, updater: (current: CourseProject) => CourseProject) => {
    setData((current) => current ? {
      ...current,
      projects: current.projects.map((item) => item.id === projectId ? updater(item) : item),
    } : current)
  }

  const updateChapter = (patch: Partial<Chapter>) => {
    if (!chapter) return
    const now = new Date().toISOString()
    mutateProject(project.id, (current) => ({
      ...current,
      updatedAt: now,
      chapters: current.chapters.map((item) => item.id === chapter.id ? { ...item, ...patch, updatedAt: now } : item),
    }))
  }

  const setActiveProject = (projectId: string) => {
    const next = data.projects.find((item) => item.id === projectId)
    if (!next) return
    setData({ ...data, activeProjectId: projectId, activeChapterId: next.chapters[0]?.id ?? '' })
  }

  const setActiveChapter = (chapterId: string) => {
    setData({ ...data, activeChapterId: chapterId })
    setMobileOutlineOpen(false)
  }

  const addProject = (title: string, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => {
    const next = createProject(title, expectedDurationValue, expectedDurationUnit)
    setData({ projects: [...data.projects, next], activeProjectId: next.id, activeChapterId: next.chapters[0].id })
  }

  const importCatalog = (chapters: Chapter[], sourceImage: string | undefined, mode: CatalogImportMode) => {
    const wasEmptyCourse = !project.chapters.length || isBlankPlaceholder(project.chapters)
    const merged = mode === 'replace'
      ? { chapters, added: chapters }
      : mergeCatalogChapters(project.chapters, chapters)
    const nextActiveId = mode === 'replace' || wasEmptyCourse
      ? merged.chapters[0].id
      : data.activeChapterId

    mutateProject(project.id, (current) => ({
      ...current,
      chapters: merged.chapters,
      sourceImage,
      updatedAt: new Date().toISOString(),
    }))
    setData((current) => current ? { ...current, activeChapterId: nextActiveId } : current)
    setToast(mode === 'replace'
      ? `已替换为 ${chapters.length} 个章节`
      : wasEmptyCourse
        ? `已生成 ${merged.added.length} 个章节`
        : `已追加 ${merged.added.length} 个新章节`)
  }

  const addChapter = () => {
    const next = createChapter('新章节', chapter?.level ?? 1)
    const index = chapter ? project.chapters.findIndex((item) => item.id === chapter.id) : -1
    mutateProject(project.id, (current) => {
      const chapters = [...current.chapters]
      chapters.splice(index + 1, 0, next)
      return { ...current, chapters, updatedAt: new Date().toISOString() }
    })
    setData((current) => current ? { ...current, activeChapterId: next.id } : current)
  }

  const removeChapter = () => {
    if (!chapter) return
    const result = removeChapterFromList(project.chapters, chapter.id)
    mutateProject(project.id, (current) => ({ ...current, chapters: result.chapters }))
    setData((current) => current ? { ...current, activeChapterId: result.activeChapterId } : current)
    setMobileDetailsOpen(false)
    setToast(`已删除“${chapter.title}”`)
  }

  const changeLevel = (delta: number) => {
    if (!chapter) return
    updateChapter({ level: Math.max(1, Math.min(3, chapter.level + delta)) })
  }

  const addScreenshots = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!chapter) return
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    const screenshots = await Promise.all(files.map(async (file) => ({
      id: makeId(),
      name: file.name,
      dataUrl: await fileToDataUrl(file),
      caption: '',
      timestamp: chapter.videoTimestamp,
      createdAt: new Date().toISOString(),
    })))
    updateChapter({ screenshots: [...chapter.screenshots, ...screenshots] })
    event.target.value = ''
  }

  const updateScreenshot = (id: string, patch: Partial<Chapter['screenshots'][number]>) => {
    if (!chapter) return
    updateChapter({ screenshots: chapter.screenshots.map((item) => item.id === id ? { ...item, ...patch } : item) })
  }

  const addAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!chapter) return
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    try {
      const imported = await Promise.all(files.map(async (file): Promise<ChapterAttachment> => ({
        id: makeId(),
        name: file.name,
        relativePath: (file.webkitRelativePath || file.name).replace(/\\/g, '/'),
        size: file.size,
        mime: file.type || 'application/octet-stream',
        storageMode: 'managed',
        dataUrl: await fileToDataUrl(file),
        createdAt: new Date().toISOString(),
      })))
      mergeImportedAttachments(imported)
      setToast(`已保存 ${imported.length} 个章节文件`)
    } catch {
      setToast('文件读取失败，请重新选择')
    } finally {
      event.target.value = ''
    }
  }

  const mergeImportedAttachments = (imported: ChapterAttachment[]) => {
    if (!chapter) return
    const merged = new Map((chapter.attachments ?? []).map((attachment) => [attachment.relativePath.toLocaleLowerCase(), attachment]))
    imported.forEach((attachment) => {
      const key = attachment.relativePath.toLocaleLowerCase()
      const existing = merged.get(key)
      merged.set(key, existing ? { ...attachment, id: existing.id } : attachment)
    })
    const attachments = Array.from(merged.values()).sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'))
    updateChapter({ attachments })
  }

  const importLinkedAttachments = async (kind: AttachmentImportKind) => {
    if (!chapter) return
    try {
      const imported: ChapterAttachment[] = []
      if (kind === 'files') {
        const handles = await window.showOpenFilePicker!({ multiple: true })
        for (const handle of handles) {
          const file = await handle.getFile()
          imported.push({
            id: makeId(), name: file.name, relativePath: file.name, size: file.size,
            mime: file.type || 'application/octet-stream', storageMode: 'linked',
            fileHandle: handle, createdAt: new Date().toISOString(),
          })
        }
      } else {
        const root = await window.showDirectoryPicker!()
        const walk = async (directory: FileSystemDirectoryHandle, path: string) => {
          for await (const [name, handle] of directory.entries()) {
            const relativePath = `${path}/${name}`
            if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, relativePath)
            else {
              const fileHandle = handle as FileSystemFileHandle
              const file = await fileHandle.getFile()
              imported.push({
                id: makeId(), name: file.name, relativePath, size: file.size,
                mime: file.type || 'application/octet-stream', storageMode: 'linked',
                fileHandle, createdAt: new Date().toISOString(),
              })
            }
          }
        }
        await walk(root, root.name)
      }
      mergeImportedAttachments(imported)
      setToast(`已链接 ${imported.length} 个原文件`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setToast('原文件链接失败，请重新选择')
    }
  }

  const confirmAttachmentImport = (mode: AttachmentStorageMode) => {
    const kind = attachmentImportKind
    if (!kind) return
    if (mode === 'linked') {
      setAttachmentImportKind(null)
      void importLinkedAttachments(kind)
      return
    }
    if (kind === 'files') attachmentInput.current?.click()
    else folderInput.current?.click()
    setAttachmentImportKind(null)
  }

  const deleteAttachment = async (attachment: ChapterAttachment) => {
    if (!chapter) return
    const hasManagedDiskCopy = attachment.storageMode !== 'linked' || Boolean(attachment.nativePath)
    const message = hasManagedDiskCopy
      ? `删除“${attachment.name}”及应用托管副本？\n\n原始源文件和你手动导出的文件不会被删除。`
      : `从章节中移除“${attachment.name}”的链接？\n\n原始源文件不会被删除。`
    if (!window.confirm(message)) return
    try {
      if (hasManagedDiskCopy) await deleteManagedAttachment(project, chapter, attachment)
      updateChapter({ attachments: (chapter.attachments ?? []).filter((item) => item.id !== attachment.id) })
      if (attachmentViewerId === attachment.id) setAttachmentViewerId(null)
      setToast(hasManagedDiskCopy ? '章节文件和应用托管副本已删除' : '原文件链接已移除')
    } catch {
      setToast('托管副本删除失败，文件记录已保留')
    }
  }

  const openAttachmentFolder = async (attachment?: ChapterAttachment) => {
    if (!chapter) throw new Error('当前章节不存在')
    const materialized = await materializeChapterFiles(project, chapter, !attachment)
    const nativePaths = new Map(materialized.files.map((file) => [file.relativePath.toLocaleLowerCase(), file.nativePath]))
    updateChapter({
      attachments: (chapter.attachments ?? []).map((item) => ({
        ...item,
        nativePath: nativePaths.get(item.relativePath.toLocaleLowerCase()) ?? item.nativePath,
      })),
    })
    if (!attachment) return materialized.rootPath
    const revealed = await revealManagedPath(project, chapter, attachment.relativePath)
    return revealed.path
  }

  const addReviewCard = () => {
    if (!chapter) return
    if (!selectedText) {
      setToast('请先在笔记中选择一段内容')
      return
    }
    const questionSeed = selectedText.length > 26 ? `${selectedText.slice(0, 26)}…` : selectedText
    updateChapter({ reviewCards: [...chapter.reviewCards, {
      id: makeId(),
      question: `你能解释“${questionSeed}”吗？`,
      answer: selectedText,
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      repetitions: 0,
    }] })
    setToast('已加入今日复习')
  }

  const scheduleCard = (cardId: string, rating: 'again' | 'hard' | 'good') => {
    if (!chapter) return
    const days = rating === 'again' ? 0 : rating === 'hard' ? 2 : 5
    const due = new Date()
    due.setDate(due.getDate() + days)
    updateChapter({ reviewCards: chapter.reviewCards.map((card) => card.id === cardId ? {
      ...card,
      dueAt: due.toISOString(),
      intervalDays: days,
      repetitions: card.repetitions + 1,
    } : card) })
  }

  const startReviewCardEdit = (card: ReviewCard) => {
    setEditingCardId(card.id)
    setCardDraft({ question: card.question, answer: card.answer })
  }

  const saveReviewCard = () => {
    if (!chapter || !editingCardId) return
    const question = cardDraft.question.trim()
    const answer = cardDraft.answer.trim()
    if (!question || !answer) {
      setToast('问题和答案不能为空')
      return
    }
    updateChapter({
      reviewCards: chapter.reviewCards.map((card) => card.id === editingCardId ? { ...card, question, answer } : card),
    })
    setEditingCardId('')
    setToast('复习卡片已更新')
  }

  const deleteReviewCard = (card: ReviewCard) => {
    if (!chapter || !window.confirm('删除这张复习卡片？')) return
    updateChapter({ reviewCards: chapter.reviewCards.filter((item) => item.id !== card.id) })
    if (editingCardId === card.id) setEditingCardId('')
    setToast('复习卡片已删除')
  }

  const changeStudyStatus = (status: StudyStatus) => {
    if (!chapter) return
    const now = Date.now()
    const elapsed = getStudyElapsedSeconds(chapter, now)
    updateChapter({
      status,
      studyElapsedSeconds: elapsed,
      studyStartedAt: status === 'learning'
        ? chapter.studyStartedAt ?? new Date(now).toISOString()
        : null,
    })
  }

  const pauseStudyTimer = () => {
    if (!chapter?.studyStartedAt) return
    updateChapter({
      studyElapsedSeconds: getStudyElapsedSeconds(chapter),
      studyStartedAt: null,
    })
  }

  const resumeStudyTimer = () => {
    if (!chapter) return
    updateChapter({ status: 'learning', studyStartedAt: new Date().toISOString() })
  }

  const resetStudyTimer = () => {
    if (!chapter) return
    const elapsed = getStudyElapsedSeconds(chapter)
    if (elapsed > 0 && !window.confirm('重置当前章节的学习计时？')) return
    updateChapter({
      studyElapsedSeconds: 0,
      studyStartedAt: chapter.status === 'learning' ? new Date().toISOString() : null,
    })
  }

  const completed = project.chapters.filter((item) => item.status === 'completed').length
  const progress = project.chapters.length ? Math.round((completed / project.chapters.length) * 100) : 0
  const courseElapsedSeconds = project.chapters.reduce((total, item) => total + getStudyElapsedSeconds(item, clockNow), 0)
  const chapterElapsedSeconds = chapter ? getStudyElapsedSeconds(chapter, clockNow) : 0
  const timerRemainingSeconds = chapter ? (chapter.studyPlanMinutes * 60) - chapterElapsedSeconds : 0
  const timerProgress = chapter ? Math.min(100, (chapterElapsedSeconds / (chapter.studyPlanMinutes * 60)) * 100) : 0
  const timerRunning = Boolean(chapter?.status === 'learning' && chapter.studyStartedAt)
  const timerStateLabel = chapter?.status === 'completed'
    ? '已完成'
    : timerRunning
      ? '进行中'
      : chapterElapsedSeconds > 0
        ? '已暂停'
        : '待开始'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <button className="icon-button mobile-only" title="课程目录" onClick={() => setMobileOutlineOpen(true)}><Menu size={19} /></button>
          <div className="brand-mark"><BookOpen size={18} /></div>
          <span className="brand-name">笔记</span>
          <span className="brand-divider" />
          <div className="project-picker-wrap">
            <select className="project-picker" value={project.id} onChange={(event) => setActiveProject(event.target.value)}>
              {data.projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="topbar-actions">
          <div className="review-count"><RotateCcw size={15} /><span>今日复习</span><strong>{dueCards}</strong></div>
          <button className="icon-button mobile-only" title="章节信息" disabled={!chapter} onClick={() => setMobileDetailsOpen(true)}><MoreHorizontal size={19} /></button>
          <button className="secondary-button desktop-action" onClick={() => setCatalogOpen(true)}><FileImage size={16} />导入目录</button>
          <button className="primary-button" onClick={() => {
            try {
              exportProject(project)
              setToast('Markdown 已导出')
            } catch {
              setToast('Markdown 导出失败')
            }
          }}><Download size={16} /><span className="desktop-action">导出 Markdown</span></button>
        </div>
      </header>

      <div className="workspace">
        {mobileOutlineOpen && <div className="mobile-scrim" onClick={() => setMobileOutlineOpen(false)} />}
        <aside className={`outline-panel ${mobileOutlineOpen ? 'mobile-open' : ''}`}>
          <div className="panel-heading">
            <div><p className="eyebrow">学习大纲</p><h2>课程目录</h2></div>
            <button className="icon-button" title="新建课程" onClick={() => setNewProjectOpen(true)}><Plus size={18} /></button>
          </div>
          <div className="course-progress">
            <div className="progress-copy"><span>{completed}/{project.chapters.length} 节</span><strong>{progress}%</strong></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            {project.expectedDurationValue && project.expectedDurationUnit && (
              <div className="course-expected-time"><CalendarClock size={13} /><span>预计完成</span><strong>{project.expectedDurationValue} {expectedDurationUnitLabel[project.expectedDurationUnit]}</strong></div>
            )}
            {progress === 100 && project.chapters.length > 0 && (
              <div className="course-total-time"><Clock3 size={13} /><span>总用时</span><strong>{formatStudyDuration(courseElapsedSeconds)}</strong></div>
            )}
          </div>
          <nav className="chapter-list" aria-label="课程章节">
            {project.chapters.map((item) => {
              const StatusIcon = statusMeta[item.status].icon
              return (
                <button
                  key={item.id}
                  className={`chapter-row ${item.id === chapter?.id ? 'active' : ''}`}
                  style={{ paddingLeft: `${14 + (item.level - 1) * 18}px` }}
                  onClick={() => setActiveChapter(item.id)}
                  title={item.title}
                >
                  <StatusIcon size={14} className={`status-${item.status}`} />
                  <span className="chapter-title">{item.title}</span>
                  {!!item.flags.length && (
                    <span className="chapter-flags" aria-label="内容标记">
                      {item.flags.map((flag) => {
                        const FlagIcon = flagMeta[flag].icon
                        return <span key={flag} className={`chapter-flag flag-${flag}`} title={flagMeta[flag].label}><FlagIcon size={12} /></span>
                      })}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
          <div className="outline-actions">
            <button className="secondary-button" onClick={addChapter}><Plus size={16} />章节</button>
            <div className="outline-icon-actions">
              <button className="icon-button" title="提升层级" disabled={!chapter || chapter.level === 1} onClick={() => changeLevel(-1)}><ArrowLeftFromLine size={16} /></button>
              <button className="icon-button" title="降低层级" disabled={!chapter || chapter.level === 3} onClick={() => changeLevel(1)}><ArrowRightFromLine size={16} /></button>
              <button className="icon-button danger" title="删除章节" disabled={!chapter} onClick={removeChapter}><Trash2 size={16} /></button>
            </div>
          </div>
        </aside>

        {chapter ? (
        <main className="note-panel">
          <div className="note-header">
            <div className="breadcrumb"><FolderTree size={14} /><span>{project.title}</span><span>/</span><span>第 {project.chapters.indexOf(chapter) + 1} 节</span></div>
            <input className="chapter-title-input" value={chapter.title} onChange={(event) => updateChapter({ title: event.target.value })} aria-label="章节名称" />
            <div className="chapter-meta-row">
              <span>{statusMeta[chapter.status].label}</span>
              <span>更新于 {formatUpdated(chapter.updatedAt)}</span>
              {chapter.videoTimestamp && <span>视频 {chapter.videoTimestamp}</span>}
              {chapterElapsedSeconds > 0 && <span>学习 {formatStudyDuration(chapterElapsedSeconds)}</span>}
            </div>
          </div>

          <section className="content-section">
            <div className="section-title-row">
              <div><p className="eyebrow">学习记录</p><h3>我的笔记</h3></div>
              <button className="secondary-button" type="button" onClick={addReviewCard}><Sparkles size={16} />制成卡片</button>
            </div>
            <NoteEditor chapterId={chapter.id} content={chapter.noteHtml} onChange={(noteHtml) => updateChapter({ noteHtml })} onSelectionChange={setSelectedText} />
          </section>

          <section className="content-section screenshot-section">
            <div className="section-title-row">
              <div><p className="eyebrow">画面证据</p><h3>视频截图</h3></div>
              <input ref={screenshotInput} type="file" accept="image/*" multiple hidden onChange={addScreenshots} />
              <button className="secondary-button" type="button" onClick={() => screenshotInput.current?.click()}><ImagePlus size={16} />添加截图</button>
            </div>
            {chapter.screenshots.length ? (
              <div className="screenshot-grid">
                {chapter.screenshots.map((item) => (
                  <article className="screenshot-item" key={item.id}>
                    <div className="screenshot-image-wrap" onDoubleClick={() => setEditingScreenshot(item)} title="双击编辑截图">
                      <img src={item.dataUrl} alt={item.caption || item.name} />
                      <button className="image-edit" type="button" title="编辑截图" onClick={() => setEditingScreenshot(item)}><Pencil size={15} /></button>
                      <button className="image-delete" title="删除截图" onClick={() => updateChapter({ screenshots: chapter.screenshots.filter((shot) => shot.id !== item.id) })}><Trash2 size={15} /></button>
                    </div>
                    <div className="screenshot-fields">
                      <input aria-label="截图说明" value={item.caption} onChange={(event) => updateScreenshot(item.id, { caption: event.target.value })} placeholder="截图说明" />
                      <div className="timestamp-input" title="可直接修改视频时间">
                        <Clock3 size={14} />
                        <input
                          aria-label="截图视频时间"
                          maxLength={8}
                          value={item.timestamp}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => updateScreenshot(item.id, { timestamp: event.target.value })}
                          placeholder="00:00"
                        />
                        <Pencil className="timestamp-edit-icon" size={11} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <button className="empty-screenshots" onClick={() => screenshotInput.current?.click()}><ImagePlus size={24} /><span>暂无截图</span></button>
            )}
          </section>

          <section className="content-section attachment-section">
            <div className="section-title-row attachment-heading">
              <div>
                <p className="eyebrow">章节资料</p>
                <h3>文件与项目</h3>
                {!!chapter.attachments?.length && <span className="attachment-summary">{chapter.attachments.length} 个文件 · {formatFileSize(chapter.attachments.reduce((total, item) => total + item.size, 0))}</span>}
              </div>
              <div className="attachment-actions">
                <input ref={attachmentInput} type="file" multiple hidden onChange={addAttachments} />
                <input
                  ref={(node) => {
                    folderInput.current = node
                    if (node) node.setAttribute('webkitdirectory', '')
                  }}
                  type="file"
                  multiple
                  hidden
                  onChange={addAttachments}
                />
                {!!chapter.attachments?.length && <button className="secondary-button" type="button" onClick={() => setAttachmentViewerId(chapter.attachments[0].id)}><FolderOpen size={16} />打开文件/项目</button>}
                <button className="secondary-button" type="button" onClick={() => setAttachmentImportKind('files')}><Files size={16} />导入文件</button>
                <button className="secondary-button" type="button" onClick={() => setAttachmentImportKind('folder')}><FolderUp size={16} />导入文件夹</button>
              </div>
            </div>
            {chapter.attachments?.length ? (
              <div className="attachment-list">
                {chapter.attachments.map((attachment) => (
                  <div className="attachment-row" key={attachment.id}>
                    <div className="attachment-icon"><FileIcon size={17} /></div>
                    <button className="attachment-info" type="button" title="查看文件" onClick={() => setAttachmentViewerId(attachment.id)}>
                      <strong title={attachment.name}>{attachment.name}</strong>
                      <span title={attachment.relativePath}>{attachment.relativePath}</span>
                    </button>
                    <span className="attachment-size">{formatFileSize(attachment.size)}</span>
                    <button className="icon-button" type="button" title="查看文件" onClick={() => setAttachmentViewerId(attachment.id)}><Eye size={15} /></button>
                    <button className="icon-button danger" type="button" title="删除文件" onClick={() => void deleteAttachment(attachment)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-attachments"><FileIcon size={20} /><span>暂无章节文件</span></div>
            )}
          </section>

          <section className="content-section reflection-section">
            <div className="section-title-row"><div><p className="eyebrow">主动回忆</p><h3>章节回顾</h3></div></div>
            <div className="reflection-grid">
              <label className="reflection-field learned"><span><BadgeCheck size={16} />我学到了</span><textarea value={chapter.reflection.learned} onChange={(event) => updateChapter({ reflection: { ...chapter.reflection, learned: event.target.value } })} /></label>
              <label className="reflection-field unclear"><span><HelpCircle size={16} />仍有疑问</span><textarea value={chapter.reflection.unclear} onChange={(event) => updateChapter({ reflection: { ...chapter.reflection, unclear: event.target.value } })} /></label>
              <label className="reflection-field application"><span><Lightbulb size={16} />实际应用</span><textarea value={chapter.reflection.application} onChange={(event) => updateChapter({ reflection: { ...chapter.reflection, application: event.target.value } })} /></label>
            </div>
          </section>
        </main>
        ) : (
          <main className="note-panel empty-note-panel">
            <section className="empty-course-state">
              <div className="empty-course-icon"><FolderTree size={26} /></div>
              <p className="eyebrow">课程文件夹</p>
              <h1>{project.title}</h1>
              <p>暂无章节</p>
              <div className="empty-course-actions">
                <button className="primary-button" type="button" onClick={() => setCatalogOpen(true)}><FileImage size={16} />导入目录</button>
                <button className="secondary-button" type="button" onClick={addChapter}><Plus size={16} />新增章节</button>
              </div>
            </section>
          </main>
        )}

        {chapter && mobileDetailsOpen && <div className="mobile-scrim" onClick={() => setMobileDetailsOpen(false)} />}
        <aside className={`details-panel ${chapter && mobileDetailsOpen ? 'mobile-open' : ''}`}>
          {chapter ? <>
          <div className="panel-heading">
            <div><p className="eyebrow">当前章节</p><h2>学习信息</h2></div>
            <button className="icon-button mobile-only" title="关闭" onClick={() => setMobileDetailsOpen(false)}><X size={18} /></button>
          </div>

          <section className="detail-section">
            <label className="detail-label">学习状态</label>
            <div className="status-segmented">
              {(Object.keys(statusMeta) as StudyStatus[]).map((status) => {
                const Icon = statusMeta[status].icon
                return <button key={status} className={chapter.status === status ? 'active' : ''} title={statusMeta[status].label} onClick={() => changeStudyStatus(status)}><Icon size={15} /><span>{statusMeta[status].label}</span></button>
              })}
            </div>
          </section>

          <section className="detail-section study-timer-section">
            <div className="detail-heading-row timer-heading">
              <label className="detail-label" htmlFor="study-plan">章节倒计时</label>
              <span className={`timer-state ${timerRunning ? 'running' : ''}`}>{timerStateLabel}</span>
            </div>
            <div className={`study-timer-display ${timerRemainingSeconds < 0 ? 'overtime' : ''}`}>
              <span>{timerRemainingSeconds < 0 ? '超时' : '剩余'}</span>
              <strong>{formatCountdown(timerRemainingSeconds)}</strong>
              <div className="timer-progress-track"><span style={{ width: `${timerProgress}%` }} /></div>
            </div>
            <div className="timer-controls">
              <label className="timer-plan-input" htmlFor="study-plan">
                <span>计划</span>
                <input
                  id="study-plan"
                  type="number"
                  min="1"
                  max="1440"
                  step="5"
                  value={chapter.studyPlanMinutes}
                  onChange={(event) => updateChapter({ studyPlanMinutes: Math.max(1, Math.min(1440, Math.round(Number(event.target.value) || 1))) })}
                />
                <span>分钟</span>
              </label>
              <div className="timer-icon-actions">
                <button className="icon-button" type="button" title={timerRunning ? '暂停倒计时' : '开始或继续倒计时'} onClick={timerRunning ? pauseStudyTimer : resumeStudyTimer}>
                  {timerRunning ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button className="icon-button" type="button" title="重置章节计时" onClick={resetStudyTimer}><RotateCcw size={15} /></button>
              </div>
            </div>
            {chapterElapsedSeconds > 0 && <p className="timer-elapsed">已学习 {formatStudyDuration(chapterElapsedSeconds)}</p>}
          </section>

          <section className="detail-section">
            <label className="detail-label" htmlFor="video-time">视频时间</label>
            <div className="input-with-icon"><Clock3 size={15} /><input id="video-time" value={chapter.videoTimestamp} onChange={(event) => updateChapter({ videoTimestamp: event.target.value })} placeholder="00:00" /></div>
          </section>

          <section className="detail-section">
            <label className="detail-label">内容标记</label>
            <div className="flag-list">
              {(Object.keys(flagMeta) as HighlightKind[]).map((flag) => {
                const Icon = flagMeta[flag].icon
                const active = chapter.flags.includes(flag)
                return <button key={flag} className={active ? 'active' : ''} onClick={() => updateChapter({ flags: active ? chapter.flags.filter((item) => item !== flag) : [...chapter.flags, flag] })}><Icon size={15} />{flagMeta[flag].label}{active && <Check size={14} />}</button>
              })}
            </div>
          </section>

          <section className="detail-section">
            <label className="detail-label" htmlFor="tags">标签</label>
            <div className="input-with-icon"><Search size={15} /><input id="tags" value={chapter.tags.join('、')} onChange={(event) => updateChapter({ tags: event.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean) })} placeholder="概念、案例" /></div>
          </section>

          <section className="detail-section review-section">
            <div className="detail-heading-row"><label className="detail-label">复习卡片</label><span>{chapter.reviewCards.length}</span></div>
            {chapter.reviewCards.length ? chapter.reviewCards.map((card) => (
              <article className={`review-card ${editingCardId === card.id ? 'editing' : ''}`} key={card.id}>
                {editingCardId === card.id ? (
                  <div className="review-card-editor">
                    <label>问题<input autoFocus value={cardDraft.question} onChange={(event) => setCardDraft({ ...cardDraft, question: event.target.value })} /></label>
                    <label>答案<textarea value={cardDraft.answer} onChange={(event) => setCardDraft({ ...cardDraft, answer: event.target.value })} /></label>
                    <div className="review-editor-actions">
                      <button className="icon-button" type="button" title="取消编辑" onClick={() => setEditingCardId('')}><X size={15} /></button>
                      <button className="icon-button confirm" type="button" title="保存卡片" onClick={saveReviewCard}><Check size={15} /></button>
                    </div>
                  </div>
                ) : <>
                  <div className="review-card-header">
                    <p>{card.question}</p>
                    <div className="review-card-tools">
                      <button className="icon-button" type="button" title="编辑卡片" onClick={() => startReviewCardEdit(card)}><Pencil size={13} /></button>
                      <button className="icon-button danger" type="button" title="删除卡片" onClick={() => deleteReviewCard(card)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <details><summary>查看答案</summary><div>{card.answer}</div></details>
                  <div className="review-actions">
                    <button onClick={() => scheduleCard(card.id, 'again')}>忘记</button>
                    <button onClick={() => scheduleCard(card.id, 'hard')}>困难</button>
                    <button onClick={() => scheduleCard(card.id, 'good')}>掌握</button>
                  </div>
                </>}
              </article>
            )) : <div className="quiet-empty"><AlignLeft size={18} /><span>暂无复习卡片</span></div>}
          </section>
          </> : <>
            <div className="panel-heading">
              <div><p className="eyebrow">当前课程</p><h2>暂无章节</h2></div>
            </div>
            <div className="empty-detail-state"><FolderTree size={20} /><span>空目录</span></div>
          </>}
        </aside>
      </div>

      <CatalogDialog open={catalogOpen} existingChapters={project.chapters} onClose={() => setCatalogOpen(false)} onImport={importCatalog} />
      <NewProjectDialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreate={addProject} />
      {editingScreenshot && (
        <Suspense fallback={<div className="annotator-loading-screen">正在打开图片编辑器…</div>}>
          <ImageAnnotator
            screenshot={editingScreenshot}
            onClose={() => setEditingScreenshot(undefined)}
            onSave={(patch) => updateScreenshot(editingScreenshot.id, patch)}
          />
        </Suspense>
      )}
      {attachmentViewerId !== null && chapter?.attachments?.length && (
        <AttachmentViewer
          attachments={chapter.attachments}
          initialAttachmentId={attachmentViewerId}
          title={`${project.title} / ${chapter.title}`}
          onClose={() => setAttachmentViewerId(null)}
          onOpenLocalFolder={openAttachmentFolder}
        />
      )}
      <AttachmentImportDialog
        open={attachmentImportKind !== null}
        kind={attachmentImportKind ?? 'files'}
        linkedSupported={attachmentImportKind === 'folder' ? typeof window.showDirectoryPicker === 'function' : typeof window.showOpenFilePicker === 'function'}
        onClose={() => setAttachmentImportKind(null)}
        onConfirm={confirmAttachmentImport}
      />
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}
