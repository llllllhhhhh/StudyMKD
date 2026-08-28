import type { CourseProject } from '../types'

export function normalizeProjectName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')
}

export function findDuplicateProject(projects: CourseProject[], title: string, excludeProjectId?: string) {
  const key = normalizeProjectName(title)
  if (!key) return undefined
  return projects.find((project) => project.id !== excludeProjectId && normalizeProjectName(project.title) === key)
}
