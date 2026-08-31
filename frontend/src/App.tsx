import { ChangeEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignLeft,
  Archive,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock3,
  Copy,
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
  Move,
  Pause,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import CatalogDialog, { type CatalogImportMode } from './components/CatalogDialog'
import AttachmentViewer from './components/AttachmentViewer'
import AttachmentImportDialog, { type AttachmentImportKind, type AttachmentStorageMode } from './components/AttachmentImportDialog'
import BackupDialog from './components/BackupDialog'
import CoursePicker from './components/CoursePicker'
import DeleteProjectDialog from './components/DeleteProjectDialog'
import GlobalSearchDialog from './components/GlobalSearchDialog'
import FocusNoteView from './components/FocusNoteView'
import MoveChapterDialog from './components/MoveChapterDialog'
import NewProjectDialog from './components/NewProjectDialog'
import NoteEditor from './components/NoteEditor'
import RenameProjectDialog from './components/RenameProjectDialog'
import ReviewSessionDialog from './components/ReviewSessionDialog'
import StudyPlannerDialog from './components/StudyPlannerDialog'
import StudyStatsDialog from './components/StudyStatsDialog'
import { createChapter, createProject, getInitialData, makeId } from './lib/data'
import { isBlankPlaceholder, mergeCatalogChapters, removeChapterFromList } from './lib/catalog'
import { exportProject } from './lib/exportMarkdown'
import { formatFileSize } from './lib/fileUtils'
import { deleteManagedAttachment, deleteManagedProject, deleteManagedRelativePath, materializeChapterFiles, materializeChapterScreenshots, renameManagedProject, revealManagedPath, screenshotManagedRelativePath } from './lib/nativeBridge'
import { findDuplicateProject } from './lib/projectNames'
import { collectDueCards, scheduleCardDue, type CardRating, type DueCardItem } from './lib/reviewCards'
import { loadData, saveData } from './lib/storage'
import { commitStudySegment } from './lib/studyStats'
import { formatCountdown, formatStudyDuration, getStudyElapsedSeconds } from './lib/studyTimer'
import { buildStudyForecast, formatPlannerDate } from './lib/studyPlanner'
import { acquireEditorLock, currentEditorLock, getWindowId, releaseEditorLock, subscribeDataChanged, subscribeEditorLock, type EditorLock } from './lib/windowSync'
import type { AppData, Chapter, ChapterAttachment, CourseProject, ExpectedDurationUnit, HighlightKind, ReviewCard, Screenshot, StudyPlan, StudyStatus } from './types'

const ImageAnnotator = lazy(() => import('./components/ImageAnnotator'))
const pageParams = new URLSearchParams(window.location.search)
const focusMode = pageParams.get('focus') === '1'
const requestedFocusProjectId = pageParams.get('projectId') ?? ''
const requestedFocusChapterId = pageParams.get('chapterId') ?? ''

const statusMeta: Record<StudyStatus, { label: string; icon: typeof Circle }> = {
  not_started: { label: '未开始', icon: Circle },
  learning: { label: '学习中', icon: Clock3 },
  completed: { label: '已完成', icon: Check },
}

type ChapterStatusFilter = 'all' | StudyStatus

const chapterStatusFilters: Array<{ value: ChapterStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'not_started', label: '未开始' },
  { value: 'learning', label: '学习中' },
  { value: 'completed', label: '已完成' },
]

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

function updateNoteScreenshotHtml(noteHtml: string, screenshotId: string, dataUrl?: string) {
  const documentNode = new DOMParser().parseFromString(noteHtml, 'text/html')
  documentNode.querySelectorAll<HTMLImageElement>('img[data-screenshot-id]').forEach((image) => {
    if (image.dataset.screenshotId !== screenshotId) return
    if (dataUrl) {
      image.src = dataUrl
      return
    }
    const parent = image.parentElement
    image.remove()
    if (parent?.tagName === 'P' && !parent.textContent?.trim() && !parent.children.length) parent.remove()
  })
  return documentNode.body.innerHTML
}

function hasNativeProjectCopies(project: CourseProject) {
  return project.chapters.some((chapter) => (
    chapter.screenshots.length > 0
    || chapter.attachments?.some((attachment) => Boolean(attachment.nativePath))
  ))
}

function projectWithRenamedNativePaths(project: CourseProject, title: string, oldPath?: string, newPath?: string) {
  const canReplacePath = Boolean(oldPath && newPath)
  return {
    ...project,
    title,
    chapters: project.chapters.map((chapter) => ({
      ...chapter,
      screenshots: chapter.screenshots.map((screenshot) => {
        if (!screenshot.nativePath || !canReplacePath) return screenshot
        const matchesRoot = screenshot.nativePath.toLocaleLowerCase().startsWith(oldPath!.toLocaleLowerCase())
        return matchesRoot ? { ...screenshot, nativePath: `${newPath}${screenshot.nativePath.slice(oldPath!.length)}` } : screenshot
      }),
      attachments: (chapter.attachments ?? []).map((attachment) => {
        if (!attachment.nativePath || !canReplacePath) return attachment
        const matchesRoot = attachment.nativePath.toLocaleLowerCase().startsWith(oldPath!.toLocaleLowerCase())
        return matchesRoot ? { ...attachment, nativePath: `${newPath}${attachment.nativePath.slice(oldPath!.length)}` } : attachment
      }),
    })),
    updatedAt: new Date().toISOString(),
  }
}

export default function App() {
  const [data, setData] = useState<AppData>()
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null)
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const [projectDeleteBusy, setProjectDeleteBusy] = useState(false)
  const [studyPlannerOpen, setStudyPlannerOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [moveChapterOpen, setMoveChapterOpen] = useState(false)
  const [mobileOutlineOpen, setMobileOutlineOpen] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [toast, setToast] = useState('')
  const [editingCardId, setEditingCardId] = useState('')
  const [cardDraft, setCardDraft] = useState({ question: '', answer: '' })
  const [editingScreenshot, setEditingScreenshot] = useState<Screenshot>()
  const [attachmentViewerId, setAttachmentViewerId] = useState<string | null>(null)
  const [attachmentImportKind, setAttachmentImportKind] = useState<AttachmentImportKind | null>(null)
  const [chapterSearch, setChapterSearch] = useState('')
  const [chapterStatusFilter, setChapterStatusFilter] = useState<ChapterStatusFilter>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [editorLock, setEditorLock] = useState<EditorLock>()
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [focusCollapsed, setFocusCollapsed] = useState(false)
  const [screenshotsExpanded, setScreenshotsExpanded] = useState(true)
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(true)
  const suppressNextSave = useRef(false)
  const screenshotInput = useRef<HTMLInputElement>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    loadData().then((saved) => {
      const next = saved ?? getInitialData()
      if (focusMode && requestedFocusProjectId) {
        const project = next.projects.find((item) => item.id === requestedFocusProjectId)
        if (project) {
          next.activeProjectId = project.id
          next.activeChapterId = project.chapters.some((item) => item.id === requestedFocusChapterId)
            ? requestedFocusChapterId
            : project.chapters[0]?.id ?? ''
        }
      }
      setData(next)
    })
  }, [])

  useEffect(() => {
    if (!data) return
    if (suppressNextSave.current) {
      suppressNextSave.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void saveData(data).catch(() => setToast('本地存储空间不足，文件未能保存'))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [data])

  useEffect(() => subscribeDataChanged((message) => {
    const sync = message as { type?: string; projectId?: string; chapterId?: string; alwaysOnTop?: boolean; collapsed?: boolean }
    if (sync?.type === 'window-state' && focusMode) {
      setAlwaysOnTop(Boolean(sync.alwaysOnTop))
      setFocusCollapsed(Boolean(sync.collapsed))
      return
    }
    if (sync?.type === 'focus-context' && focusMode) {
      void loadData().then((saved) => {
        if (!saved) return
        const targetProject = saved.projects.find((item) => item.id === sync.projectId)
        if (!targetProject) return
        suppressNextSave.current = true
        setData({
          ...saved,
          activeProjectId: targetProject.id,
          activeChapterId: targetProject.chapters.some((item) => item.id === sync.chapterId)
            ? sync.chapterId ?? ''
            : targetProject.chapters[0]?.id ?? '',
        })
      })
      return
    }
    if (sync?.type !== 'data-changed') return
    void loadData().then((saved) => {
      if (!saved) return
      suppressNextSave.current = true
      setData(saved)
    })
  }), [])

  useEffect(() => subscribeEditorLock(setEditorLock), [])

  useEffect(() => {
    if (!focusMode || !data?.activeProjectId || !data.activeChapterId) return
    acquireEditorLock(data.activeProjectId, data.activeChapterId)
    const timer = window.setInterval(() => acquireEditorLock(data.activeProjectId, data.activeChapterId), 1500)
    window.addEventListener('beforeunload', releaseEditorLock)
    window.addEventListener('pagehide', releaseEditorLock)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('beforeunload', releaseEditorLock)
      window.removeEventListener('pagehide', releaseEditorLock)
      releaseEditorLock()
    }
  }, [data?.activeChapterId, data?.activeProjectId])

  useEffect(() => {
    if (!window.studyMKDDesktop || !focusMode) return
    void window.studyMKDDesktop.getWindowState().then((state) => {
      setAlwaysOnTop(state.alwaysOnTop)
      setFocusCollapsed(state.collapsed)
    })
  }, [])

  useEffect(() => {
    document.title = focusMode ? 'StudyMKD · 专注笔记' : window.studyMKDDesktop ? 'StudyMKD' : '笔记 · 视频学习'
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    setEditingCardId('')
    setAttachmentViewerId(null)
  }, [data?.activeChapterId])

  useEffect(() => {
    setChapterSearch('')
    setChapterStatusFilter('all')
    setTagFilter(null)
    setStudyPlannerOpen(false)
  }, [data?.activeProjectId])

  const project = data?.projects.find((item) => item.id === data.activeProjectId)
  const chapter = project?.chapters.find((item) => item.id === data?.activeChapterId)
  const chapterLockedByFocus = Boolean(
    !focusMode
    && editorLock
    && editorLock.ownerId !== getWindowId()
    && editorLock.projectId === project?.id
    && editorLock.chapterId === chapter?.id,
  )

  const dueCardItems = useMemo<DueCardItem[]>(() => data ? collectDueCards(data) : [], [data])
  const dueCards = dueCardItems.length

  const hasRunningTimer = useMemo(() => Boolean(data?.projects.some((item) => (
    item.chapters.some((chapterItem) => chapterItem.status === 'learning' && chapterItem.studyStartedAt)
  ))), [data])

  const savedStudyForecast = useMemo(() => (
    project?.studyPlan ? buildStudyForecast(project, project.studyPlan, clockNow) : undefined
  ), [clockNow, project])

  const projectTags = useMemo(() => (
    project ? Array.from(new Set(project.chapters.flatMap((item) => item.tags))).sort((left, right) => left.localeCompare(right, 'zh-CN')) : []
  ), [project])

  useEffect(() => {
    if (!hasRunningTimer) return
    setClockNow(Date.now())
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasRunningTimer])

  if (!data) {
    return <div className="loading-screen"><BookOpen size={25} /><span>正在打开课程…</span></div>
  }

  if (!project) {
    const createFirstProject = (title: string, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => {
      const next = createProject(title, expectedDurationValue, expectedDurationUnit)
      setData({ projects: [next], activeProjectId: next.id, activeChapterId: next.chapters[0].id })
    }
    return (
      <div className="app-shell no-project-shell">
        <header className="topbar">
          <div className="brand-group">
            <div className="brand-mark"><BookOpen size={18} /></div>
            <span className="brand-name">笔记</span>
            <span className="brand-divider" />
            <CoursePicker projects={[]} activeProjectId="" onSelect={() => undefined} onCreate={() => setNewProjectOpen(true)} onRename={() => undefined} onDelete={() => undefined} />
          </div>
        </header>
        <main className="no-project-state">
          <div className="empty-course-icon"><FolderTree size={26} /></div>
          <p className="eyebrow">课程目录</p>
          <h1>还没有课程</h1>
          <p>新建课程后即可导入目录并记录学习内容。</p>
          <button className="primary-button" type="button" onClick={() => setNewProjectOpen(true)}><Plus size={16} />新建课程</button>
        </main>
        <NewProjectDialog
          open={newProjectOpen}
          projects={[]}
          onClose={() => setNewProjectOpen(false)}
          onCreate={createFirstProject}
          onUseExisting={() => undefined}
          onReplaceExisting={() => undefined}
        />
      </div>
    )
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
    setChapterSearch('')
    setData({ ...data, activeProjectId: projectId, activeChapterId: next.chapters[0]?.id ?? '' })
  }

  const setActiveChapter = (chapterId: string) => {
    setData({ ...data, activeChapterId: chapterId })
    setMobileOutlineOpen(false)
  }

  const openFocusWindow = async () => {
    if (!project || !chapter) return
    if (window.studyMKDDesktop) {
      await window.studyMKDDesktop.openFocusWindow({ projectId: project.id, chapterId: chapter.id })
      return
    }
    const url = new URL(window.location.href)
    url.search = new URLSearchParams({ focus: '1', projectId: project.id, chapterId: chapter.id }).toString()
    window.open(url, 'StudyMKDFocus', 'width=440,height=720')
  }

  const toggleAlwaysOnTop = async () => {
    if (!window.studyMKDDesktop) return
    const result = await window.studyMKDDesktop.setAlwaysOnTop(!alwaysOnTop)
    setAlwaysOnTop(result.alwaysOnTop)
  }

  const addProject = (title: string, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => {
    const duplicate = findDuplicateProject(data.projects, title)
    if (duplicate) {
      setActiveProject(duplicate.id)
      setToast(`已切换到已有课程“${duplicate.title}”`)
      return
    }
    const next = createProject(title, expectedDurationValue, expectedDurationUnit)
    setData({ projects: [...data.projects, next], activeProjectId: next.id, activeChapterId: next.chapters[0].id })
  }

  const removeProjectManagedDirectory = async (target: CourseProject) => {
    if (!hasNativeProjectCopies(target)) return
    await deleteManagedProject(target)
  }

  const renameProject = async (projectId: string, title: string) => {
    const target = data.projects.find((item) => item.id === projectId)
    if (!target) return
    try {
      const nativeMove = hasNativeProjectCopies(target) ? await renameManagedProject(target, title) : undefined
      setData((current) => current ? {
        ...current,
        projects: current.projects.map((item) => item.id === projectId
          ? projectWithRenamedNativePaths(item, title, nativeMove?.oldPath, nativeMove?.newPath)
          : item),
      } : current)
      setToast(`课程已重命名为“${title}”`)
    } catch {
      setToast('课程重命名失败，托管文件夹未能移动')
    }
  }

  const deleteProject = async (target: CourseProject) => {
    setProjectDeleteBusy(true)
    try {
      await removeProjectManagedDirectory(target)
      setData((current) => {
        if (!current) return current
        const index = current.projects.findIndex((item) => item.id === target.id)
        const projects = current.projects.filter((item) => item.id !== target.id)
        if (current.activeProjectId !== target.id) return { ...current, projects }
        const next = projects[Math.max(0, Math.min(index, projects.length - 1))]
        return { ...current, projects, activeProjectId: next?.id ?? '', activeChapterId: next?.chapters[0]?.id ?? '' }
      })
      setDeleteProjectId(null)
      setToast(`已删除课程“${target.title}”`)
    } catch {
      setToast('课程删除失败，应用托管副本未能清理')
    } finally {
      setProjectDeleteBusy(false)
    }
  }

  const replaceExistingWithNewProject = async (existingProjectId: string, title: string, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => {
    const existing = data.projects.find((item) => item.id === existingProjectId)
    if (!existing) return
    try {
      await removeProjectManagedDirectory(existing)
      const next = createProject(title, expectedDurationValue, expectedDurationUnit)
      setData((current) => current ? {
        projects: current.projects.map((item) => item.id === existingProjectId ? next : item),
        activeProjectId: next.id,
        activeChapterId: next.chapters[0].id,
      } : current)
      setToast(`已替换课程“${title}”`)
    } catch {
      setToast('课程替换失败，已有课程保持不变')
    }
  }

  const replaceExistingWithCurrentProject = async (projectId: string, existingProjectId: string, title: string) => {
    const currentProject = data.projects.find((item) => item.id === projectId)
    const existing = data.projects.find((item) => item.id === existingProjectId)
    if (!currentProject || !existing) return
    let nativeMove: Awaited<ReturnType<typeof renameManagedProject>> | undefined
    try {
      nativeMove = hasNativeProjectCopies(currentProject) ? await renameManagedProject(currentProject, title) : undefined
      await removeProjectManagedDirectory(existing)
      const renamed = projectWithRenamedNativePaths(currentProject, title, nativeMove?.oldPath, nativeMove?.newPath)
      setData((current) => current ? {
        projects: current.projects.filter((item) => item.id !== existingProjectId).map((item) => item.id === projectId ? renamed : item),
        activeProjectId: projectId,
        activeChapterId: current.activeProjectId === projectId ? current.activeChapterId : renamed.chapters[0]?.id ?? '',
      } : current)
      setToast(`当前课程已替换同名课程“${title}”`)
    } catch {
      if (nativeMove?.moved) {
        await renameManagedProject({ ...currentProject, title }, currentProject.title).catch(() => undefined)
      }
      setToast('同名课程替换失败，两个课程均保持不变')
    }
  }

  const saveStudyPlan = (plan: StudyPlan, expectedDurationValue: number, expectedDurationUnit: ExpectedDurationUnit) => {
    mutateProject(project.id, (current) => ({
      ...current,
      studyPlan: plan,
      expectedDurationValue,
      expectedDurationUnit,
      updatedAt: new Date().toISOString(),
    }))
    setToast('学习计划已保存')
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

  const createScreenshots = async (files: File[], noteLinked = false) => {
    if (!chapter) return
    if (!files.length) return []
    const screenshots: Screenshot[] = await Promise.all(files.map(async (file) => ({
      id: makeId(),
      name: file.name || `粘贴图片-${new Date().toLocaleString('zh-CN').replace(/[\s/:]/g, '-')}.png`,
      dataUrl: await fileToDataUrl(file),
      caption: '',
      timestamp: chapter.videoTimestamp,
      createdAt: new Date().toISOString(),
      noteLinked,
    })))
    let storedScreenshots = screenshots
    try {
      const materialized = await materializeChapterScreenshots(project, chapter, screenshots)
      const paths = new Map(materialized.files.map((file) => [file.relativePath, file.nativePath]))
      storedScreenshots = screenshots.map((screenshot) => {
        const nativeRelativePath = screenshotManagedRelativePath(screenshot)
        return { ...screenshot, nativeRelativePath, nativePath: paths.get(nativeRelativePath) }
      })
    } catch {
      setToast('截图已添加，本地路径将在导出时重试保存')
    }
    const now = new Date().toISOString()
    mutateProject(project.id, (current) => ({
      ...current,
      updatedAt: now,
      chapters: current.chapters.map((item) => item.id === chapter.id
        ? { ...item, screenshots: [...item.screenshots, ...storedScreenshots], updatedAt: now }
        : item),
    }))
    return storedScreenshots
  }

  const addScreenshots = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    await createScreenshots(files)
    event.target.value = ''
  }

  const pasteImageIntoNote = async (file: File) => {
    const screenshots = await createScreenshots([file], true)
    const screenshot = screenshots?.[0]
    if (!screenshot) throw new Error('当前章节不存在')
    setToast('图片已加入视频截图，并插入笔记')
    return screenshot
  }

  const updateScreenshot = (id: string, patch: Partial<Chapter['screenshots'][number]>) => {
    if (!chapter) return
    updateChapter({
      screenshots: chapter.screenshots.map((item) => item.id === id ? { ...item, ...patch } : item),
      ...(patch.dataUrl ? { noteHtml: updateNoteScreenshotHtml(chapter.noteHtml, id, patch.dataUrl) } : {}),
    })
  }

  const deleteScreenshot = async (screenshot: Screenshot) => {
    if (!chapter) return
    const relativePath = screenshot.nativeRelativePath ?? screenshotManagedRelativePath(screenshot)
    try {
      await deleteManagedRelativePath(project, chapter, relativePath)
    } catch {
      setToast('截图记录已删除，本地托管副本未能清理')
    }
    updateChapter({
      screenshots: chapter.screenshots.filter((item) => item.id !== screenshot.id),
      noteHtml: updateNoteScreenshotHtml(chapter.noteHtml, screenshot.id),
    })
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

  const scheduleCard = (cardId: string, rating: CardRating) => {
    if (!chapter) return
    updateChapter({ reviewCards: chapter.reviewCards.map((card) => card.id === cardId ? scheduleCardDue(card, rating) : card) })
  }

  const rateReviewCard = (projectId: string, chapterId: string, cardId: string, rating: CardRating) => {
    setData((current) => current ? {
      ...current,
      projects: current.projects.map((projectItem) => projectItem.id !== projectId ? projectItem : {
        ...projectItem,
        updatedAt: new Date().toISOString(),
        chapters: projectItem.chapters.map((chapterItem) => chapterItem.id !== chapterId ? chapterItem : {
          ...chapterItem,
          updatedAt: new Date().toISOString(),
          reviewCards: chapterItem.reviewCards.map((card) => card.id === cardId ? scheduleCardDue(card, rating) : card),
        }),
      }),
    } : current)
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

  const moveActiveChapter = (direction: -1 | 1) => {
    if (!chapter) return
    const index = project.chapters.findIndex((item) => item.id === chapter.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= project.chapters.length) return
    const chapters = [...project.chapters]
    const [moving] = chapters.splice(index, 1)
    chapters.splice(target, 0, moving)
    mutateProject(project.id, (current) => ({ ...current, chapters, updatedAt: new Date().toISOString() }))
  }

  const duplicateActiveChapter = () => {
    if (!chapter) return
    const copy: Chapter = {
      ...chapter,
      id: makeId(),
      title: `${chapter.title}（副本）`,
      studyStartedAt: null,
      updatedAt: new Date().toISOString(),
      studySegments: (chapter.studySegments ?? []).map((segment) => ({ ...segment })),
      reviewCards: chapter.reviewCards.map((card) => ({ ...card, id: makeId() })),
      screenshots: chapter.screenshots.map((screenshot) => ({ ...screenshot, id: makeId() })),
      attachments: (chapter.attachments ?? []).map((attachment) => ({ ...attachment, id: makeId() })),
    }
    const index = project.chapters.findIndex((item) => item.id === chapter.id)
    mutateProject(project.id, (current) => {
      const chapters = [...current.chapters]
      chapters.splice(index + 1, 0, copy)
      return { ...current, chapters, updatedAt: new Date().toISOString() }
    })
    setData((current) => current ? { ...current, activeChapterId: copy.id } : current)
    setToast('已复制章节')
  }

  const moveActiveChapterToProject = (targetProjectId: string) => {
    if (!chapter || targetProjectId === project.id) return
    const targetProject = data.projects.find((item) => item.id === targetProjectId)
    const moving: Chapter = {
      ...chapter,
      studyStartedAt: null,
      studySegments: (chapter.studySegments ?? []).map((segment) => ({ ...segment })),
      screenshots: chapter.screenshots.map((screenshot) => {
        const { nativePath: _nativePath, nativeRelativePath: _nativeRelativePath, ...rest } = screenshot
        return rest
      }),
      attachments: (chapter.attachments ?? []).map((attachment) => {
        const { nativePath: _nativePath, ...rest } = attachment
        return rest
      }),
      updatedAt: new Date().toISOString(),
    }
    setData((current) => current ? {
      ...current,
      projects: current.projects.map((projectItem) => {
        if (projectItem.id === project.id) {
          return { ...projectItem, chapters: projectItem.chapters.filter((item) => item.id !== chapter.id), updatedAt: new Date().toISOString() }
        }
        if (projectItem.id === targetProjectId) {
          return { ...projectItem, chapters: [...projectItem.chapters, moving], updatedAt: new Date().toISOString() }
        }
        return projectItem
      }),
      activeProjectId: targetProjectId,
      activeChapterId: moving.id,
    } : current)
    setToast(`已移动到“${targetProject?.title ?? '目标课程'}”`)
  }

  const restoreBackup = (restored: AppData, mode: 'replace' | 'merge') => {
    setData(restored)
    setBackupOpen(false)
    setToast(mode === 'replace' ? '已替换为备份中的数据' : '备份中的新课程已导入')
  }

  const openSearchResult = (projectId: string, chapterId: string) => {
    setChapterSearch('')
    setChapterStatusFilter('all')
    setTagFilter(null)
    setData({ ...data, activeProjectId: projectId, activeChapterId: chapterId })
  }

  const changeStudyStatus = (status: StudyStatus) => {
    if (!chapter) return
    const now = Date.now()
    const elapsed = getStudyElapsedSeconds(chapter, now)
    const leavingLearning = chapter.status === 'learning' && status !== 'learning'
    const committed = leavingLearning ? commitStudySegment(chapter, now) : undefined
    updateChapter({
      status,
      studyElapsedSeconds: elapsed,
      studyStartedAt: status === 'learning'
        ? chapter.studyStartedAt ?? new Date(now).toISOString()
        : null,
      ...(committed ? { studySegments: committed.segments } : {}),
    })
  }

  const pauseStudyTimer = () => {
    if (!chapter?.studyStartedAt) return
    const committed = commitStudySegment(chapter)
    updateChapter({
      studyElapsedSeconds: getStudyElapsedSeconds(chapter),
      studyStartedAt: null,
      studySegments: committed.segments,
    })
  }

  const resumeStudyTimer = () => {
    if (!chapter) return
    updateChapter({ status: 'learning', studyStartedAt: new Date().toISOString() })
  }

  const resetStudyTimer = () => {
    if (!chapter) return
    const elapsed = getStudyElapsedSeconds(chapter)
    if (elapsed > 0 && !window.confirm('重置当前章节的学习计时？学习历史记录也会一并清除。')) return
    updateChapter({
      studyElapsedSeconds: 0,
      studyStartedAt: chapter.status === 'learning' ? new Date().toISOString() : null,
      studySegments: [],
    })
  }

  const completed = project.chapters.filter((item) => item.status === 'completed').length
  const progress = project.chapters.length ? Math.round((completed / project.chapters.length) * 100) : 0
  const normalizedChapterSearch = chapterSearch.trim().toLocaleLowerCase('zh-CN')
  const visibleChapters = project.chapters.filter((item) => {
    const titleMatches = !normalizedChapterSearch || item.title.toLocaleLowerCase('zh-CN').includes(normalizedChapterSearch)
    const statusMatches = chapterStatusFilter === 'all' || item.status === chapterStatusFilter
    const tagMatches = !tagFilter || item.tags.includes(tagFilter)
    return titleMatches && statusMatches && tagMatches
  })
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

  if (focusMode && chapter) {
    const chapterIndex = project.chapters.findIndex((item) => item.id === chapter.id)
    return (
      <>
      <FocusNoteView
        projectTitle={project.title}
        chapter={chapter}
        chapterIndex={chapterIndex}
        chapterCount={project.chapters.length}
        timerRemainingSeconds={timerRemainingSeconds}
        elapsedSeconds={chapterElapsedSeconds}
        timerRunning={timerRunning}
        alwaysOnTop={alwaysOnTop}
        collapsed={focusCollapsed}
        desktop={Boolean(window.studyMKDDesktop)}
        onPasteImage={pasteImageIntoNote}
        onOpenScreenshot={(screenshotId) => {
          const screenshot = chapter.screenshots.find((item) => item.id === screenshotId)
          if (screenshot) setEditingScreenshot(screenshot)
        }}
        onNoteChange={(noteHtml) => updateChapter({ noteHtml })}
        onVideoTimestampChange={(videoTimestamp) => updateChapter({ videoTimestamp })}
        onToggleTimer={timerRunning ? pauseStudyTimer : resumeStudyTimer}
        onPrevious={() => chapterIndex > 0 && setActiveChapter(project.chapters[chapterIndex - 1].id)}
        onNext={() => chapterIndex < project.chapters.length - 1 && setActiveChapter(project.chapters[chapterIndex + 1].id)}
        onToggleAlwaysOnTop={() => void toggleAlwaysOnTop()}
        onShowMain={() => window.studyMKDDesktop ? void window.studyMKDDesktop.showMainWindow() : window.opener?.focus()}
        onCollapse={() => window.studyMKDDesktop && void window.studyMKDDesktop.collapseFocusWindow()}
        onExpand={() => window.studyMKDDesktop && void window.studyMKDDesktop.expandFocusWindow()}
        onClose={() => window.studyMKDDesktop ? void window.studyMKDDesktop.closeCurrentWindow() : window.close()}
      />
      {editingScreenshot && (
        <Suspense fallback={<div className="annotator-loading-screen">正在打开图片编辑器…</div>}>
          <ImageAnnotator
            screenshot={editingScreenshot}
            onClose={() => setEditingScreenshot(undefined)}
            onSave={(patch) => updateScreenshot(editingScreenshot.id, patch)}
          />
        </Suspense>
      )}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
      </>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <button className="icon-button mobile-only outline-toggle" title="课程目录" onClick={() => setMobileOutlineOpen(true)}><Menu size={19} /></button>
          <div className="brand-mark"><BookOpen size={18} /></div>
          <span className="brand-name">笔记</span>
          <span className="brand-divider" />
          <CoursePicker
            projects={data.projects}
            activeProjectId={project.id}
            onSelect={setActiveProject}
            onCreate={() => setNewProjectOpen(true)}
            onRename={setRenameProjectId}
            onDelete={setDeleteProjectId}
          />
        </div>
        <div className="topbar-actions">
          <button className="review-count" type="button" title="开始今日复习" onClick={() => setReviewOpen(true)}><RotateCcw size={15} /><span>今日复习</span><strong>{dueCards}</strong></button>
          <button className="icon-button" type="button" title="全局搜索" onClick={() => setGlobalSearchOpen(true)}><Search size={17} /></button>
          <button className="icon-button" type="button" title="专注笔记小窗" disabled={!chapter} onClick={() => void openFocusWindow()}><PanelRightOpen size={17} /></button>
          <button className="icon-button mobile-only details-toggle" title="章节信息" disabled={!chapter} onClick={() => setMobileDetailsOpen(true)}><MoreHorizontal size={19} /></button>
          <button className="secondary-button" type="button" title="学习计划" onClick={() => setStudyPlannerOpen(true)}><CalendarClock size={16} /><span className="desktop-action">学习计划</span></button>
          <button className="secondary-button" type="button" title="学习统计" onClick={() => setStatsOpen(true)}><BarChart3 size={16} /><span className="desktop-action">学习统计</span></button>
          <button className="secondary-button" type="button" title="数据备份与恢复" onClick={() => setBackupOpen(true)}><Archive size={16} /><span className="desktop-action">备份</span></button>
          <button className="secondary-button" type="button" title="导入目录" onClick={() => setCatalogOpen(true)}><FileImage size={16} /><span className="desktop-action">导入目录</span></button>
          <button className="primary-button" onClick={() => void exportProject(project)
            .then((result) => setToast(result.embeddedScreenshots > 0
              ? `Markdown 已导出，${result.embeddedScreenshots} 张截图已内嵌（当前环境无本地桥接）`
              : 'Markdown 已导出，截图使用本地托管路径'))
            .catch(() => setToast('Markdown 导出失败，截图本地路径无法保存'))}><Download size={16} /><span className="desktop-action">导出 Markdown</span></button>
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
            {project.studyPlan && (
              <div className="course-forecast-time"><CalendarClock size={13} /><span>动态预测</span><strong>{savedStudyForecast?.completionDate ? formatPlannerDate(savedStudyForecast.completionDate) : '待安排'}</strong></div>
            )}
            {progress === 100 && project.chapters.length > 0 && (
              <div className="course-total-time"><Clock3 size={13} /><span>总用时</span><strong>{formatStudyDuration(courseElapsedSeconds)}</strong></div>
            )}
          </div>
          <div className="outline-search" role="search">
            <Search size={14} />
            <input
              aria-label="搜索课程目录"
              value={chapterSearch}
              onChange={(event) => setChapterSearch(event.target.value)}
              placeholder="搜索章节"
            />
            {(chapterSearch || chapterStatusFilter !== 'all') && <span>{visibleChapters.length}/{project.chapters.length}</span>}
            {chapterSearch && <button className="icon-button" type="button" title="清空目录搜索" onClick={() => setChapterSearch('')}><X size={14} /></button>}
          </div>
          <div className="chapter-status-filter" role="group" aria-label="筛选章节状态">
            {chapterStatusFilters.map((filter) => (
              <button
                key={filter.value}
                className={chapterStatusFilter === filter.value ? 'active' : ''}
                type="button"
                onClick={() => setChapterStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {projectTags.length > 0 && (
            <div className="chapter-tag-filter" role="group" aria-label="按标签筛选章节">
              <Tag size={13} />
              {projectTags.map((tag) => (
                <button
                  key={tag}
                  className={tagFilter === tag ? 'active' : ''}
                  type="button"
                  title={`筛选“${tag}”`}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
              {tagFilter && <button className="tag-clear" type="button" title="清除标签筛选" onClick={() => setTagFilter(null)}><X size={12} /></button>}
            </div>
          )}
          <nav className="chapter-list" aria-label="课程章节">
            {visibleChapters.map((item) => {
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
            {!visibleChapters.length && (
              <div className="chapter-search-empty"><Search size={18} /><span>没有符合条件的章节</span></div>
            )}
          </nav>
          <div className="outline-actions">
            <button className="secondary-button" onClick={addChapter}><Plus size={16} />章节</button>
            <div className="outline-icon-actions">
              <button className="icon-button" title="上移章节" disabled={!chapter || chapter === project.chapters[0]} onClick={() => moveActiveChapter(-1)}><ArrowUp size={15} /></button>
              <button className="icon-button" title="下移章节" disabled={!chapter || chapter === project.chapters[project.chapters.length - 1]} onClick={() => moveActiveChapter(1)}><ArrowDown size={15} /></button>
              <button className="icon-button" title="复制章节" disabled={!chapter} onClick={duplicateActiveChapter}><Copy size={15} /></button>
              <button className="icon-button" title="移动到其他课程" disabled={!chapter || data.projects.length < 2} onClick={() => setMoveChapterOpen(true)}><Move size={15} /></button>
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
            {chapterLockedByFocus && <div className="editor-lock-notice"><PanelRightOpen size={15} /><span>本章节正在专注小窗中编辑，主窗口暂时只读。</span></div>}
            <NoteEditor
              chapterId={chapter.id}
              content={chapter.noteHtml}
              editable={!chapterLockedByFocus}
              onPasteImage={pasteImageIntoNote}
              onOpenScreenshot={(screenshotId) => {
                const screenshot = chapter.screenshots.find((item) => item.id === screenshotId)
                if (screenshot) setEditingScreenshot(screenshot)
              }}
              onChange={(noteHtml) => updateChapter({ noteHtml })}
              onSelectionChange={setSelectedText}
            />
          </section>

          <section className={`content-section screenshot-section ${screenshotsExpanded ? '' : 'section-collapsed'}`}>
            <div className="section-title-row">
              <div><p className="eyebrow">画面证据</p><h3>视频截图</h3></div>
              <div className="section-title-actions">
                <input ref={screenshotInput} type="file" accept="image/*" multiple hidden onChange={addScreenshots} />
                <button className="secondary-button" type="button" onClick={() => screenshotInput.current?.click()}><ImagePlus size={16} />添加截图</button>
                <button
                  className="icon-button section-toggle"
                  type="button"
                  title={screenshotsExpanded ? '收起视频截图' : '展开视频截图'}
                  aria-label={screenshotsExpanded ? '收起视频截图' : '展开视频截图'}
                  aria-expanded={screenshotsExpanded}
                  onClick={() => setScreenshotsExpanded((value) => !value)}
                >
                  {screenshotsExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </button>
              </div>
            </div>
            {screenshotsExpanded && (chapter.screenshots.length ? (
              <div className="screenshot-grid">
                {chapter.screenshots.map((item) => (
                  <article className="screenshot-item" key={item.id}>
                    <div className="screenshot-image-wrap" onDoubleClick={() => setEditingScreenshot(item)} title="双击编辑截图">
                      <img src={item.dataUrl} alt={item.caption || item.name} />
                      <button className="image-edit" type="button" title="编辑截图" onClick={() => setEditingScreenshot(item)}><Pencil size={15} /></button>
                      <button className="image-delete" title="删除截图" onClick={() => void deleteScreenshot(item)}><Trash2 size={15} /></button>
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
            ))}
          </section>

          <section className={`content-section attachment-section ${attachmentsExpanded ? '' : 'section-collapsed'}`}>
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
                <button
                  className="icon-button section-toggle"
                  type="button"
                  title={attachmentsExpanded ? '收起文件与项目' : '展开文件与项目'}
                  aria-label={attachmentsExpanded ? '收起文件与项目' : '展开文件与项目'}
                  aria-expanded={attachmentsExpanded}
                  onClick={() => setAttachmentsExpanded((value) => !value)}
                >
                  {attachmentsExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </button>
              </div>
            </div>
            {attachmentsExpanded && (chapter.attachments?.length ? (
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
            ))}
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
            <button className="icon-button mobile-only details-close" title="关闭" onClick={() => setMobileDetailsOpen(false)}><X size={18} /></button>
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
      <NewProjectDialog
        open={newProjectOpen}
        projects={data.projects}
        onClose={() => setNewProjectOpen(false)}
        onCreate={addProject}
        onUseExisting={(projectId) => { setActiveProject(projectId); setToast('已切换到已有课程') }}
        onReplaceExisting={(projectId, title, duration, unit) => void replaceExistingWithNewProject(projectId, title, duration, unit)}
      />
      <RenameProjectDialog
        open={renameProjectId !== null}
        project={data.projects.find((item) => item.id === renameProjectId)}
        projects={data.projects}
        onClose={() => setRenameProjectId(null)}
        onRename={(projectId, title) => void renameProject(projectId, title)}
        onUseExisting={(projectId) => { setActiveProject(projectId); setToast('已切换到已有课程') }}
        onReplaceExisting={(projectId, existingProjectId, title) => void replaceExistingWithCurrentProject(projectId, existingProjectId, title)}
      />
      <DeleteProjectDialog
        open={deleteProjectId !== null}
        project={data.projects.find((item) => item.id === deleteProjectId)}
        busy={projectDeleteBusy}
        onClose={() => !projectDeleteBusy && setDeleteProjectId(null)}
        onConfirm={(target) => void deleteProject(target)}
      />
      <StudyPlannerDialog open={studyPlannerOpen} project={project} onClose={() => setStudyPlannerOpen(false)} onSave={saveStudyPlan} />
      <ReviewSessionDialog open={reviewOpen} items={dueCardItems} onClose={() => setReviewOpen(false)} onRate={rateReviewCard} />
      <StudyStatsDialog open={statsOpen} project={project} onClose={() => setStatsOpen(false)} />
      <BackupDialog open={backupOpen} data={data} onClose={() => setBackupOpen(false)} onRestore={restoreBackup} />
      <GlobalSearchDialog open={globalSearchOpen} data={data} onClose={() => setGlobalSearchOpen(false)} onOpen={openSearchResult} />
      <MoveChapterDialog open={moveChapterOpen} chapter={chapter} currentProject={project} projects={data.projects} onClose={() => setMoveChapterOpen(false)} onMove={moveActiveChapterToProject} />
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
