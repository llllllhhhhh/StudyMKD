interface StudyMKDDesktopApi {
  isDesktop: true
  platform: string
  nativeRequest<T>(path: string, body?: unknown): Promise<T>
  openFocusWindow(context: { projectId: string; chapterId: string }): Promise<{ opened: boolean; reused: boolean }>
  setAlwaysOnTop(value: boolean): Promise<{ alwaysOnTop: boolean }>
  collapseFocusWindow(): Promise<{ collapsed: boolean }>
  expandFocusWindow(): Promise<{ collapsed: boolean }>
  getWindowState(): Promise<{ alwaysOnTop: boolean; focusWindow: boolean; collapsed: boolean }>
  closeCurrentWindow(): Promise<boolean>
  showMainWindow(): Promise<boolean>
  broadcastDataChanged(message: unknown): void
  onDataChanged(listener: (message: unknown) => void): () => void
}

interface Window {
  studyMKDDesktop?: StudyMKDDesktopApi
}
