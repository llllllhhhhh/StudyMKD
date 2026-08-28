import type { AppData, Chapter, CourseProject } from '../types'

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  data: AppData
}

const BACKUP_APP = 'StudyMKD'

export function serializeBackup(data: AppData): string {
  const backup: BackupFile = {
    app: BACKUP_APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
  return JSON.stringify(backup, null, 2)
}

export function parseBackup(text: string): AppData {
  const parsed = JSON.parse(text) as Partial<BackupFile> & { data?: unknown }
  if (!parsed || parsed.app !== BACKUP_APP || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('不是有效的 StudyMKD 备份文件')
  }
  const data = parsed.data as Partial<AppData>
  if (!Array.isArray(data.projects)) throw new Error('备份中缺少课程数据')
  const projects = data.projects.map((project): CourseProject => {
    const item = project as Partial<CourseProject>
    if (!item.id || typeof item.title !== 'string') throw new Error('备份中的课程数据格式不正确')
    return {
      id: item.id,
      title: item.title,
      expectedDurationValue: item.expectedDurationValue,
      expectedDurationUnit: item.expectedDurationUnit,
      studyPlan: item.studyPlan,
      sourceImage: item.sourceImage,
      chapters: (Array.isArray(item.chapters) ? item.chapters : []).map((chapter): Chapter => ({
        id: chapter.id,
        title: chapter.title,
        level: chapter.level ?? 1,
        status: chapter.status ?? 'not_started',
        studyPlanMinutes: chapter.studyPlanMinutes ?? 30,
        studyElapsedSeconds: chapter.studyElapsedSeconds ?? 0,
        studyStartedAt: chapter.studyStartedAt ?? null,
        studySegments: chapter.studySegments ?? [],
        noteHtml: chapter.noteHtml ?? '',
        videoTimestamp: chapter.videoTimestamp ?? '',
        tags: chapter.tags ?? [],
        flags: chapter.flags ?? [],
        reflection: {
          learned: chapter.reflection?.learned ?? '',
          unclear: chapter.reflection?.unclear ?? '',
          application: chapter.reflection?.application ?? '',
        },
        screenshots: chapter.screenshots ?? [],
        reviewCards: chapter.reviewCards ?? [],
        attachments: chapter.attachments ?? [],
        updatedAt: chapter.updatedAt ?? new Date().toISOString(),
      })),
      createdAt: item.createdAt ?? new Date().toISOString(),
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    }
  })
  return {
    projects,
    activeProjectId: typeof data.activeProjectId === 'string' ? data.activeProjectId : (projects[0]?.id ?? ''),
    activeChapterId: typeof data.activeChapterId === 'string' ? data.activeChapterId : (projects[0]?.chapters[0]?.id ?? ''),
  }
}

export function mergeBackupData(current: AppData, incoming: AppData): AppData {
  const existingIds = new Set(current.projects.map((project) => project.id))
  const added = incoming.projects.filter((project) => !existingIds.has(project.id))
  const projects = [...current.projects, ...added]
  return {
    projects,
    activeProjectId: current.activeProjectId || projects[0]?.id || '',
    activeChapterId: current.activeChapterId || projects[0]?.chapters[0]?.id || '',
  }
}
