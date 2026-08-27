import type { AppData, Chapter, CourseProject } from '../types'

export const makeId = () => crypto.randomUUID()

export function createChapter(title: string, level = 1): Chapter {
  return {
    id: makeId(),
    title,
    level,
    status: 'not_started',
    noteHtml: '',
    videoTimestamp: '',
    tags: [],
    flags: [],
    reflection: { learned: '', unclear: '', application: '' },
    screenshots: [],
    reviewCards: [],
    attachments: [],
    updatedAt: new Date().toISOString(),
  }
}

export function createProject(title: string): CourseProject {
  const chapter = createChapter('开始学习', 1)
  const now = new Date().toISOString()
  return {
    id: makeId(),
    title,
    chapters: [chapter],
    createdAt: now,
    updatedAt: now,
  }
}

export function getInitialData(): AppData {
  const project = createProject('我的视频课程')
  project.chapters = [
    createChapter('第一章 · 课程导览', 1),
    createChapter('1.1 学习目标', 2),
    createChapter('1.2 核心概念', 2),
    createChapter('第二章 · 深入学习', 1),
  ]
  return {
    projects: [project],
    activeProjectId: project.id,
    activeChapterId: project.chapters[0].id,
  }
}
