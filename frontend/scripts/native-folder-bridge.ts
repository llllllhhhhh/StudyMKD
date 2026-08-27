import { spawn } from 'node:child_process'
import { mkdir, rmdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const bridgeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'managed')
const MAX_BODY_BYTES = 250 * 1024 * 1024

type NativeFile = { relativePath: string; base64: string }
type NativeLocation = { id: string; title: string }
type MaterializeRequest = { project: NativeLocation; chapter: NativeLocation; files: NativeFile[]; openExplorer?: boolean }
type RevealRequest = { project: NativeLocation; chapter: NativeLocation; relativePath?: string }
type DeleteManagedRequest = { project: NativeLocation; chapter: NativeLocation; relativePath: string }

function safeSegment(value: string, fallback: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim()
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned.slice(0, 100) : fallback
}

function locationSegment(location: NativeLocation, fallback: string) {
  const name = safeSegment(location.title, fallback)
  const suffix = safeSegment(location.id, 'item').replace(/-/g, '').slice(0, 8)
  return `${name} [${suffix}]`
}

function safeRelativePath(value: string) {
  const segments = value.split(/[\\/]+/).filter((segment) => segment && segment !== '.' && segment !== '..')
  return segments.map((segment, index) => safeSegment(segment, `file-${index + 1}`))
}

function managedDirectory(project: NativeLocation, chapter: NativeLocation) {
  return resolve(bridgeRoot, locationSegment(project, '课程'), locationSegment(chapter, '章节'))
}

function assertWithinRoot(target: string) {
  const pathFromRoot = relative(bridgeRoot, target)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) throw new Error('目标路径超出托管目录')
}

function isLoopback(request: IncomingMessage) {
  const address = request.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('文件总大小超过 250 MB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

function openExplorer(target: string, selectFile = false) {
  if (process.platform !== 'win32') throw new Error('当前系统不支持 Windows 资源管理器')
  const args = selectFile ? [`/select,${target}`] : [target]
  spawn('explorer.exe', args, { detached: true, stdio: 'ignore', windowsHide: false }).unref()
}

async function materialize(payload: MaterializeRequest) {
  const directory = managedDirectory(payload.project, payload.chapter)
  assertWithinRoot(directory)
  await mkdir(directory, { recursive: true })
  const files: Array<{ relativePath: string; nativePath: string }> = []

  for (const file of payload.files) {
    const segments = safeRelativePath(file.relativePath)
    if (!segments.length) continue
    const target = resolve(directory, ...segments)
    assertWithinRoot(target)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, Buffer.from(file.base64, 'base64'))
    files.push({ relativePath: file.relativePath, nativePath: target })
  }

  if (payload.openExplorer) openExplorer(directory)
  return { rootPath: directory, files }
}

async function reveal(payload: RevealRequest) {
  const directory = managedDirectory(payload.project, payload.chapter)
  const segments = payload.relativePath ? safeRelativePath(payload.relativePath) : []
  const target = segments.length ? resolve(directory, ...segments) : directory
  assertWithinRoot(target)
  openExplorer(target, segments.length > 0)
  return { path: target }
}

async function deleteManaged(payload: DeleteManagedRequest) {
  const directory = managedDirectory(payload.project, payload.chapter)
  const segments = safeRelativePath(payload.relativePath)
  if (!segments.length) throw new Error('托管文件路径为空')
  const target = resolve(directory, ...segments)
  assertWithinRoot(target)
  let removed = true
  try {
    await unlink(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') removed = false
    else throw error
  }

  let current = dirname(target)
  while (current !== bridgeRoot && relative(bridgeRoot, current) && !relative(bridgeRoot, current).startsWith('..')) {
    try {
      await rmdir(current)
      current = dirname(current)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOTEMPTY' || code === 'EEXIST' || code === 'ENOENT') break
      throw error
    }
  }
  return { removed, path: target }
}

export function nativeFolderBridge(): Plugin {
  return {
    name: 'keji-native-folder-bridge',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url?.split('?')[0]
        if (!url?.startsWith('/api/native/')) return next()
        if (!isLoopback(request)) return sendJson(response, 403, { error: '仅允许本机访问' })

        try {
          if (request.method === 'GET' && url === '/api/native/capabilities') {
            return sendJson(response, 200, { nativeFolderBridge: true, platform: process.platform, managedRoot: bridgeRoot })
          }
          if (request.method === 'POST' && url === '/api/native/materialize') {
            return sendJson(response, 200, await materialize(await readJson<MaterializeRequest>(request)))
          }
          if (request.method === 'POST' && url === '/api/native/reveal') {
            return sendJson(response, 200, await reveal(await readJson<RevealRequest>(request)))
          }
          if (request.method === 'POST' && url === '/api/native/delete-managed') {
            return sendJson(response, 200, await deleteManaged(await readJson<DeleteManagedRequest>(request)))
          }
          return sendJson(response, 404, { error: '接口不存在' })
        } catch (error) {
          return sendJson(response, 400, { error: error instanceof Error ? error.message : '本地桥接操作失败' })
        }
      })
    },
  }
}
