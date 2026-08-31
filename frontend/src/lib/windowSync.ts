const dataChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('studymkd-data') : undefined
const lockChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('studymkd-locks') : undefined
const windowId = crypto.randomUUID()
const LOCK_KEY = 'studymkd-active-editor-lock'

export interface EditorLock {
  ownerId: string
  projectId: string
  chapterId: string
  expiresAt: number
}

export function notifyDataChanged() {
  const message = { type: 'data-changed', sourceId: windowId, timestamp: Date.now() }
  if (window.studyMKDDesktop) window.studyMKDDesktop.broadcastDataChanged(message)
  else dataChannel?.postMessage(message)
}

export function subscribeDataChanged(listener: (message: unknown) => void) {
  if (window.studyMKDDesktop) return window.studyMKDDesktop.onDataChanged(listener)
  const handler = (event: MessageEvent) => listener(event.data)
  dataChannel?.addEventListener('message', handler)
  return () => dataChannel?.removeEventListener('message', handler)
}

export function getWindowId() {
  return windowId
}

function parseLock(value: string | null): EditorLock | undefined {
  if (!value) return undefined
  try {
    const lock = JSON.parse(value) as EditorLock
    return lock.expiresAt > Date.now() ? lock : undefined
  } catch {
    return undefined
  }
}

export function currentEditorLock() {
  return parseLock(localStorage.getItem(LOCK_KEY))
}

export function acquireEditorLock(projectId: string, chapterId: string) {
  const lock: EditorLock = { ownerId: windowId, projectId, chapterId, expiresAt: Date.now() + 4500 }
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock))
  lockChannel?.postMessage(lock)
  return lock
}

export function releaseEditorLock() {
  const current = currentEditorLock()
  if (current?.ownerId === windowId) localStorage.removeItem(LOCK_KEY)
  lockChannel?.postMessage(null)
}

export function subscribeEditorLock(listener: (lock?: EditorLock) => void) {
  const emit = () => listener(currentEditorLock())
  const channelHandler = () => emit()
  const storageHandler = (event: StorageEvent) => {
    if (event.key === LOCK_KEY) emit()
  }
  lockChannel?.addEventListener('message', channelHandler)
  window.addEventListener('storage', storageHandler)
  const timer = window.setInterval(emit, 1000)
  emit()
  return () => {
    lockChannel?.removeEventListener('message', channelHandler)
    window.removeEventListener('storage', storageHandler)
    window.clearInterval(timer)
  }
}
