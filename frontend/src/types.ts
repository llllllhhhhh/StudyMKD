export type StudyStatus = 'not_started' | 'learning' | 'completed'
export type HighlightKind = 'key' | 'question' | 'review' | 'practice' | 'mastered'

export interface Screenshot {
  id: string
  name: string
  dataUrl: string
  caption: string
  timestamp: string
  createdAt: string
  annotationJson?: string
  annotationWidth?: number
  annotationHeight?: number
  originalDataUrl?: string
}

export interface ReviewCard {
  id: string
  question: string
  answer: string
  dueAt: string
  intervalDays: number
  repetitions: number
}

export interface ChapterAttachment {
  id: string
  name: string
  relativePath: string
  size: number
  mime: string
  storageMode?: 'managed' | 'linked'
  dataUrl?: string
  fileHandle?: FileSystemFileHandle
  nativePath?: string
  createdAt: string
}

export interface Chapter {
  id: string
  title: string
  level: number
  status: StudyStatus
  studyPlanMinutes: number
  studyElapsedSeconds: number
  studyStartedAt: string | null
  noteHtml: string
  videoTimestamp: string
  tags: string[]
  flags: HighlightKind[]
  reflection: {
    learned: string
    unclear: string
    application: string
  }
  screenshots: Screenshot[]
  reviewCards: ReviewCard[]
  attachments: ChapterAttachment[]
  updatedAt: string
}

export interface CourseProject {
  id: string
  title: string
  sourceImage?: string
  chapters: Chapter[]
  createdAt: string
  updatedAt: string
}

export interface AppData {
  projects: CourseProject[]
  activeProjectId: string
  activeChapterId: string
}
