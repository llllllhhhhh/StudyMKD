import { get, set } from 'idb-keyval'
import type { AppData } from '../types'
import { normalizeStudyPlan } from './studyPlanner'
import { notifyDataChanged } from './windowSync'

const STORAGE_KEY = 'keji-app-data-v1'

export async function loadData(): Promise<AppData | undefined> {
  const data = await get<AppData>(STORAGE_KEY)
  if (!data) return undefined
  return {
    ...data,
    projects: data.projects.map((project) => ({
      ...project,
      expectedDurationValue: project.expectedDurationValue && project.expectedDurationValue > 0
        ? project.expectedDurationValue
        : undefined,
      expectedDurationUnit: project.expectedDurationUnit ?? undefined,
      studyPlan: project.studyPlan ? normalizeStudyPlan(project.studyPlan) : undefined,
      chapters: project.chapters.map((chapter) => ({
        ...chapter,
        studyPlanMinutes: Math.max(1, chapter.studyPlanMinutes ?? 30),
        studyElapsedSeconds: Math.max(0, chapter.studyElapsedSeconds ?? 0),
        studyStartedAt: chapter.studyStartedAt ?? null,
        studySegments: (chapter.studySegments ?? []).map((segment) => ({
          start: segment.start,
          end: segment.end,
          seconds: Math.max(0, Math.round(segment.seconds ?? 0)),
        })),
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
  notifyDataChanged()
}
