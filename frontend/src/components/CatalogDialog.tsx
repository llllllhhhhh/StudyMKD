import { useEffect, useRef, useState } from 'react'
import { FileImage, LoaderCircle, ScanText, X } from 'lucide-react'
import type { Chapter } from '../types'
import { getNewCatalogChapters, isBlankPlaceholder } from '../lib/catalog'
import { parseCatalogText, recognizeCatalog } from '../lib/ocr'

export type CatalogImportMode = 'append' | 'replace'

interface Props {
  open: boolean
  existingChapters: Chapter[]
  onClose: () => void
  onImport: (chapters: Chapter[], image: string | undefined, mode: CatalogImportMode) => void
}

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = reject
  reader.readAsDataURL(file)
})

export default function CatalogDialog({ open, existingChapters, onClose, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState('')
  const [text, setText] = useState('')
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [importMode, setImportMode] = useState<CatalogImportMode>('append')

  useEffect(() => {
    if (open) return
    setFile(undefined)
    setPreview('')
    setText('')
    setProgress(0)
    setStage('')
    setError('')
    setImportMode('append')
  }, [open])

  if (!open) return null

  const chooseFile = async (selected?: File) => {
    if (!selected) return
    setFile(selected)
    setPreview(await fileToDataUrl(selected))
    setText('')
    setError('')
    await runOcr(selected)
  }

  const runOcr = async (source = file) => {
    if (!source) return
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      const recognized = await recognizeCatalog(source, (value, status) => {
        setProgress(value)
        setStage(status)
      })
      if (!recognized) throw new Error('图片中没有识别到文字')
      setText(recognized)
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : '未知错误'
      setError(`图片识别失败：${detail}。你可以重新识别，或直接修订右侧目录。`)
    } finally {
      setBusy(false)
    }
  }

  const parsedChapters = parseCatalogText(text)
  const parsedCount = parsedChapters.length
  const isNewCourse = !existingChapters.length || isBlankPlaceholder(existingChapters)
  const newChapterCount = getNewCatalogChapters(existingChapters, parsedChapters).length

  const importCatalog = () => {
    if (!parsedChapters.length) {
      setError('目录内容为空。')
      return
    }
    onImport(parsedChapters, preview || undefined, importMode)
    onClose()
  }

  const stageLabel: Record<string, string> = {
    'loading tesseract core': '正在加载识别引擎',
    'initializing tesseract': '正在初始化识别引擎',
    'loading language traineddata': '正在加载本地中文模型',
    'initializing api': '正在准备文字分析',
    'recognizing text': '正在分析目录文字',
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal catalog-modal" role="dialog" aria-modal="true" aria-label="导入课程目录">
        <header className="modal-header">
          <div>
            <p className="eyebrow">目录识别</p>
            <h2>导入课程目录</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="catalog-grid">
          <div className="catalog-image-pane">
            <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
            {preview ? (
              <button className="image-preview" type="button" onClick={() => inputRef.current?.click()} title="更换目录图片">
                <img src={preview} alt="课程目录预览" />
              </button>
            ) : (
              <button className="upload-dropzone" type="button" onClick={() => inputRef.current?.click()}>
                <FileImage size={26} />
                <span>选择目录图片</span>
                <small>PNG、JPG 或 WebP</small>
              </button>
            )}
            <button className="secondary-button full-width" type="button" onClick={() => runOcr()} disabled={!file || busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <ScanText size={17} />}
              {busy ? `${stageLabel[stage] ?? '正在识别'} ${Math.round(progress * 100)}%` : text ? '重新识别图片' : '识别图片文字'}
            </button>
          </div>
          <div className="catalog-text-pane">
            <label htmlFor="catalog-text">识别结果</label>
            <textarea id="catalog-text" value={text} onChange={(event) => setText(event.target.value)} placeholder={'第一章 课程介绍\n1.1 学习目标\n1.2 核心概念'} />
            <p className={`field-meta ${parsedCount ? 'recognized-meta' : ''}`}>
              {parsedCount ? `已识别 ${parsedCount} 个目录项，可直接修订后生成。` : '每行生成一个章节，编号层级会自动识别。'}
            </p>
          </div>
        </div>
        <div className="import-mode-row">
          <div>
            <span className="field-label">导入方式</span>
            <small>{isNewCourse ? '当前是空白课程，将生成新目录。' : '默认只追加图片中的新章节。'}</small>
          </div>
          <div className="import-mode-control" role="group" aria-label="导入方式">
            <button className={importMode === 'append' ? 'active' : ''} type="button" onClick={() => setImportMode('append')}>追加新章节</button>
            <button className={importMode === 'replace' ? 'active danger-mode' : ''} type="button" onClick={() => setImportMode('replace')}>替换整个目录</button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
        <footer className="modal-footer">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="button" onClick={importCatalog} disabled={!parsedCount || busy || (importMode === 'append' && !newChapterCount)}>
            {busy
              ? '正在分析图片'
              : importMode === 'replace'
                ? `替换为 ${parsedCount} 个章节`
                : isNewCourse
                  ? `生成 ${newChapterCount} 个章节`
                  : newChapterCount
                    ? `追加 ${newChapterCount} 个新章节`
                    : '没有新章节'}
          </button>
        </footer>
      </section>
    </div>
  )
}
