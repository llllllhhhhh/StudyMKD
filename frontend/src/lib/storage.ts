import { get, set } from 'idb-keyval'
import type { AppData } from '../types'

const STORAGE_KEY = 'keji-app-data-v1'

export async function loadData(): Promise<AppData | undefined> {
  const data = await get<AppData>(STORAGE_KEY)
  if (!data) return undefined
  return {
    ...data,
    projects: data.projects.map((project) => ({
      ...project,
      chapters: project.chapters.map((chapter) => ({
        ...chapter,
        studyPlanMinutes: Math.max(1, chapter.studyPlanMinutes ?? 30),
        studyElapsedSeconds: Math.max(0, chapter.studyElapsedSeconds ?? 0),
        studyStartedAt: chapter.studyStartedAt ?? null,
        attachments: (chapter.attachments ?? []).map((attachment) => ({
          ...attachment,
          storageMode: attachment.storageMode ?? 'managed',
        })),
      })),
    })),
  }
}

export async function saveData(data: AppData): Promise<void> {
  await set(STORAGE_KEY, data)
}
