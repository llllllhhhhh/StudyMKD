const { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, shell } = require('electron')
const { mkdir, rename, rm, rmdir, unlink, writeFile } = require('node:fs/promises')
const { appendFileSync } = require('node:fs')
const { dirname, isAbsolute, relative, resolve } = require('node:path')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

protocol.registerSchemesAsPrivileged([{
  scheme: 'studymkd',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

const isDev = process.argv.includes('--dev')
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173/'
const rendererRoot = resolve(__dirname, '..', 'dist')
const preloadPath = resolve(__dirname, 'preload.cjs')
const MAX_FILE_BYTES = 250 * 1024 * 1024

let mainWindow
let focusWindow
let focusWindowCollapsed = false
let focusWindowExpandedBounds
let focusAnimation

function logMainError(error) {
  try {
    const message = `${new Date().toISOString()} ${error?.stack || error}\n`
    appendFileSync(resolve(app.getPath('userData'), 'studymkd-main.log'), message, 'utf8')
  } catch {
    // The app may be shutting down before its user-data directory is available.
  }
}

process.on('uncaughtException', (error) => {
  logMainError(error)
  app.quit()
})
process.on('unhandledRejection', logMainError)

function managedRoot() {
  if (isDev) return resolve(__dirname, '..', '..', 'data', 'managed')
  return resolve(app.getPath('documents'), 'StudyMKD', 'data', 'managed')
}

function safeSegment(value, fallback) {
  const cleaned = String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim()
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned.slice(0, 100) : fallback
}

function locationSegment(location, fallback) {
  const name = safeSegment(location.title, fallback)
  const suffix = safeSegment(location.id, 'item').replace(/-/g, '').slice(0, 8)
  return `${name} [${suffix}]`
}

function safeRelativePath(value) {
  return String(value || '').split(/[\\/]+/).filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment, index) => safeSegment(segment, `file-${index + 1}`))
}

function managedProjectDirectory(project) {
  return resolve(managedRoot(), locationSegment(project, '课程'))
}

function managedDirectory(project, chapter) {
  return resolve(managedProjectDirectory(project), locationSegment(chapter, '章节'))
}

function assertWithinRoot(target) {
  const root = managedRoot()
  const pathFromRoot = relative(root, target)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) throw new Error('目标路径超出托管目录')
}

async function materialize(payload) {
  const directory = managedDirectory(payload.project, payload.chapter)
  assertWithinRoot(directory)
  await mkdir(directory, { recursive: true })
  const files = []
  for (const file of payload.files || []) {
    const segments = safeRelativePath(file.relativePath)
    if (!segments.length) continue
    const bytes = Buffer.from(file.base64 || '', 'base64')
    if (bytes.length > MAX_FILE_BYTES) throw new Error('单个文件超过 250 MB')
    const target = resolve(directory, ...segments)
    assertWithinRoot(target)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
    files.push({ relativePath: file.relativePath, nativePath: target })
  }
  if (payload.openExplorer) await shell.openPath(directory)
  return { rootPath: directory, files }
}

async function reveal(payload) {
  const directory = managedDirectory(payload.project, payload.chapter)
  const segments = payload.relativePath ? safeRelativePath(payload.relativePath) : []
  const target = segments.length ? resolve(directory, ...segments) : directory
  assertWithinRoot(target)
  if (segments.length) shell.showItemInFolder(target)
  else {
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  }
  return { path: target }
}

async function deleteManaged(payload) {
  const directory = managedDirectory(payload.project, payload.chapter)
  const segments = safeRelativePath(payload.relativePath)
  if (!segments.length) throw new Error('托管文件路径为空')
  const target = resolve(directory, ...segments)
  assertWithinRoot(target)
  let removed = true
  try {
    await unlink(target)
  } catch (error) {
    if (error.code === 'ENOENT') removed = false
    else throw error
  }
  let current = dirname(target)
  const root = managedRoot()
  while (current !== root && relative(root, current) && !relative(root, current).startsWith('..')) {
    try {
      await rmdir(current)
      current = dirname(current)
    } catch (error) {
      if (['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes(error.code)) break
      throw error
    }
  }
  return { removed, path: target }
}

async function renameManagedProject(payload) {
  const source = managedProjectDirectory(payload.project)
  const target = managedProjectDirectory({ ...payload.project, title: payload.title })
  assertWithinRoot(source)
  assertWithinRoot(target)
  if (source === target) return { moved: false, oldPath: source, newPath: target }
  try {
    await rename(source, target)
    return { moved: true, oldPath: source, newPath: target }
  } catch (error) {
    if (error.code === 'ENOENT') return { moved: false, oldPath: source, newPath: target }
    throw error
  }
}

async function deleteManagedProject(payload) {
  const directory = managedProjectDirectory(payload.project)
  assertWithinRoot(directory)
  await rm(directory, { recursive: true, force: true })
  return { removed: true, path: directory }
}

async function nativeRequest(requestPath, body) {
  if (requestPath === 'capabilities') {
    return { nativeFolderBridge: true, desktop: true, platform: process.platform, managedRoot: managedRoot() }
  }
  if (requestPath === 'materialize') return materialize(body)
  if (requestPath === 'reveal') return reveal(body)
  if (requestPath === 'delete-managed') return deleteManaged(body)
  if (requestPath === 'rename-managed-project') return renameManagedProject(body)
  if (requestPath === 'delete-managed-project') return deleteManagedProject(body)
  throw new Error('接口不存在')
}

function browserOptions(overrides = {}) {
  return {
    show: false,
    backgroundColor: '#f7f7f4',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    ...overrides,
  }
}

function rendererUrl(query = {}) {
  const search = new URLSearchParams(query).toString()
  if (isDev) return `${devServerUrl}${search ? `?${search}` : ''}`
  return `studymkd://app/index.html${search ? `?${search}` : ''}`
}

async function loadRenderer(window, query = {}) {
  window.once('ready-to-show', () => window.show())
  await window.loadURL(rendererUrl(query))
  if (!window.isVisible()) window.show()
}

function createMainWindow() {
  mainWindow = new BrowserWindow(browserOptions({
    title: 'StudyMKD',
    width: 1440,
    height: 900,
    minWidth: 880,
    minHeight: 640,
  }))
  loadRenderer(mainWindow)
  mainWindow.on('closed', () => { mainWindow = undefined })
}

async function openFocusWindow(context = {}) {
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.webContents.send('studymkd:data-sync', { type: 'focus-context', ...context })
    if (focusWindowCollapsed) await expandFocusWindow()
    focusWindow.show()
    focusWindow.focus()
    return { opened: true, reused: true }
  }
  focusWindow = new BrowserWindow(browserOptions({
    title: 'StudyMKD · 专注笔记',
    width: 440,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    alwaysOnTop: true,
    resizable: true,
    frame: false,
    transparent: true,
    hasShadow: true,
    backgroundColor: '#00000000',
  }))
  focusWindow.setAlwaysOnTop(true, 'floating')
  await loadRenderer(focusWindow, {
    focus: '1',
    projectId: context.projectId || '',
    chapterId: context.chapterId || '',
  })
  focusWindowCollapsed = false
  focusWindowExpandedBounds = focusWindow.getBounds()
  focusWindow.webContents.send('studymkd:data-sync', { type: 'window-state', alwaysOnTop: true, collapsed: false })
  const rememberBounds = () => {
    if (!focusWindowCollapsed && focusWindow && !focusWindow.isDestroyed()) focusWindowExpandedBounds = focusWindow.getBounds()
  }
  focusWindow.on('move', rememberBounds)
  focusWindow.on('resize', rememberBounds)
  focusWindow.on('closed', () => {
    if (focusAnimation) clearInterval(focusAnimation)
    focusAnimation = undefined
    focusWindow = undefined
    focusWindowCollapsed = false
    focusWindowExpandedBounds = undefined
  })
  return { opened: true, reused: false }
}

function sendFocusWindowState(collapsed = focusWindowCollapsed) {
  if (!focusWindow || focusWindow.isDestroyed()) return
  focusWindow.webContents.send('studymkd:data-sync', {
    type: 'window-state',
    alwaysOnTop: focusWindow.isAlwaysOnTop(),
    collapsed,
  })
}

function animateFocusBounds(from, to, onComplete) {
  if (!focusWindow || focusWindow.isDestroyed()) return Promise.resolve()
  if (focusAnimation) clearInterval(focusAnimation)
  const duration = 120
  const startedAt = Date.now()
  return new Promise((resolveAnimation) => {
    focusAnimation = setInterval(() => {
      if (!focusWindow || focusWindow.isDestroyed()) {
        clearInterval(focusAnimation)
        focusAnimation = undefined
        resolveAnimation()
        return
      }
      const progress = Math.min(1, (Date.now() - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const bounds = {
        x: Math.round(from.x + (to.x - from.x) * eased),
        y: Math.round(from.y + (to.y - from.y) * eased),
        width: Math.max(1, Math.round(from.width + (to.width - from.width) * eased)),
        height: Math.max(1, Math.round(from.height + (to.height - from.height) * eased)),
      }
      focusWindow.setBounds(bounds, false)
      if (progress >= 1) {
        clearInterval(focusAnimation)
        focusAnimation = undefined
        onComplete?.()
        resolveAnimation()
      }
    }, 24)
  })
}

async function collapseFocusWindow() {
  if (!focusWindow || focusWindow.isDestroyed() || focusWindowCollapsed) return { collapsed: focusWindowCollapsed }
  const from = focusWindow.getBounds()
  focusWindowExpandedBounds = from
  const { workArea } = screen.getDisplayMatching(from)
  const size = 64
  const target = {
    x: workArea.x + workArea.width - 42,
    y: workArea.y + workArea.height - size - 20,
    width: size,
    height: size,
  }
  focusWindowCollapsed = true
  focusWindow.setMinimumSize(1, 1)
  focusWindow.setResizable(false)
  focusWindow.setSkipTaskbar(true)
  focusWindow.setAlwaysOnTop(true, 'floating')
  sendFocusWindowState(true)
  await animateFocusBounds(from, target)
  return { collapsed: true }
}

async function expandFocusWindow() {
  if (!focusWindow || focusWindow.isDestroyed() || !focusWindowCollapsed) return { collapsed: focusWindowCollapsed }
  const from = focusWindow.getBounds()
  const target = focusWindowExpandedBounds || { x: from.x - 376, y: from.y - 636, width: 440, height: 720 }
  if (focusAnimation) clearInterval(focusAnimation)
  focusAnimation = undefined
  focusWindow.setBounds(target, false)
  focusWindowCollapsed = false
  focusWindow.setMinimumSize(360, 480)
  focusWindow.setResizable(true)
  focusWindow.setSkipTaskbar(false)
  sendFocusWindowState(false)
  focusWindow.focus()
  return { collapsed: false }
}

function registerIpc() {
  ipcMain.handle('studymkd:native-request', (_event, requestPath, body) => nativeRequest(requestPath, body))
  ipcMain.handle('studymkd:open-focus-window', (_event, context) => openFocusWindow(context))
  ipcMain.handle('studymkd:set-always-on-top', (event, value) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.setAlwaysOnTop(Boolean(value), 'floating')
    const alwaysOnTop = window?.isAlwaysOnTop() ?? false
    window?.webContents.send('studymkd:data-sync', { type: 'window-state', alwaysOnTop, collapsed: window === focusWindow && focusWindowCollapsed })
    return { alwaysOnTop }
  })
  ipcMain.handle('studymkd:collapse-focus-window', () => collapseFocusWindow())
  ipcMain.handle('studymkd:expand-focus-window', () => expandFocusWindow())
  ipcMain.handle('studymkd:get-window-state', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return { alwaysOnTop: window?.isAlwaysOnTop() ?? false, focusWindow: window === focusWindow, collapsed: window === focusWindow && focusWindowCollapsed }
  })
  ipcMain.handle('studymkd:close-current-window', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return true
  })
  ipcMain.handle('studymkd:show-main-window', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender)
    if (sourceWindow === focusWindow && !sourceWindow.isDestroyed()) sourceWindow.close()
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow()
    else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    return true
  })
  ipcMain.on('studymkd:broadcast-data-changed', (event, message) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window.webContents !== event.sender) window.webContents.send('studymkd:data-sync', message)
    })
  })
}

function registerProtocol() {
  protocol.handle('studymkd', (request) => {
    const url = new URL(request.url)
    const requestedPath = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'index.html'
    const target = resolve(rendererRoot, requestedPath)
    if (relative(rendererRoot, target).startsWith('..')) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(target).toString())
  })
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    registerProtocol()
    registerIpc()
    await mkdir(managedRoot(), { recursive: true })
    createMainWindow()
  }).catch((error) => {
    logMainError(error)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
