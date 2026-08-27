import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Eraser,
  MousePointer2,
  PaintbrushVertical,
  Pencil,
  Redo2,
  RotateCcw,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import {
  Canvas,
  Group,
  IText,
  Line,
  PencilBrush,
  Triangle,
  type TPointerEventInfo,
} from 'fabric'
import type { Screenshot } from '../types'

type Tool = 'select' | 'draw' | 'arrow' | 'text' | 'erase'

interface Props {
  screenshot: Screenshot
  onClose: () => void
  onSave: (patch: Pick<Screenshot, 'dataUrl' | 'annotationJson' | 'annotationWidth' | 'annotationHeight' | 'originalDataUrl'>) => void
}

const COLORS = ['#e5483f', '#f2b233', '#246b67', '#2674c8', '#222825', '#ffffff']

export default function ImageAnnotator({ screenshot, onClose, onSave }: Props) {
  const canvasElement = useRef<HTMLCanvasElement>(null)
  const fabricCanvas = useRef<Canvas>()
  const sourceImage = useRef<HTMLImageElement>()
  const history = useRef<string[]>([])
  const historyIndex = useRef(-1)
  const restoring = useRef(false)
  const toolRef = useRef<Tool>('select')
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#e5483f')
  const [strokeWidth, setStrokeWidth] = useState(5)
  const [ready, setReady] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [, forceHistoryRender] = useState(0)

  const recordHistory = () => {
    const canvas = fabricCanvas.current
    if (!canvas || restoring.current) return
    const snapshot = JSON.stringify(canvas.toJSON())
    history.current = history.current.slice(0, historyIndex.current + 1)
    history.current.push(snapshot)
    historyIndex.current = history.current.length - 1
    forceHistoryRender((value) => value + 1)
  }

  useEffect(() => {
    if (!canvasElement.current) return
    const canvas = new Canvas(canvasElement.current, {
      backgroundColor: 'transparent',
      enableRetinaScaling: false,
      preserveObjectStacking: true,
      selectionColor: 'rgba(36, 107, 103, .12)',
      selectionBorderColor: '#246b67',
    })
    fabricCanvas.current = canvas
    let cancelled = false

    const initialize = async () => {
      const image = new Image()
      image.src = screenshot.originalDataUrl || screenshot.dataUrl
      await image.decode()
      if (cancelled) return
      sourceImage.current = image
      const originalWidth = image.naturalWidth || 1280
      const originalHeight = image.naturalHeight || 720
      const maxWidth = Math.max(300, Math.min(1200, window.innerWidth - 96))
      const maxHeight = Math.max(260, Math.min(720, window.innerHeight - 190))
      const scale = Math.min(1, maxWidth / originalWidth, maxHeight / originalHeight)
      const width = Math.round(originalWidth * scale)
      const height = Math.round(originalHeight * scale)
      canvas.setDimensions({ width, height })
      setCanvasSize({ width, height })

      if (screenshot.annotationJson) {
        restoring.current = true
        await canvas.loadFromJSON(screenshot.annotationJson)
        const oldWidth = screenshot.annotationWidth || width
        const oldHeight = screenshot.annotationHeight || height
        const scaleX = width / oldWidth
        const scaleY = height / oldHeight
        canvas.getObjects().forEach((object) => {
          object.set({
            left: (object.left || 0) * scaleX,
            top: (object.top || 0) * scaleY,
            scaleX: (object.scaleX || 1) * scaleX,
            scaleY: (object.scaleY || 1) * scaleY,
          })
          object.setCoords()
        })
        restoring.current = false
      }

      canvas.requestRenderAll()
      recordHistory()
      setReady(true)
    }

    initialize().catch(() => setReady(true))
    canvas.on('path:created', ({ path }) => {
      if (toolRef.current === 'erase') {
        path.set({
          globalCompositeOperation: 'destination-out',
          selectable: false,
          evented: false,
        })
        canvas.requestRenderAll()
      }
      recordHistory()
    })
    canvas.on('object:modified', recordHistory)

    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        void restoreHistory(event.shiftKey ? 1 : -1)
      }
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      cancelled = true
      window.removeEventListener('keydown', handleKey)
      canvas.dispose()
      fabricCanvas.current = undefined
    }
  }, [screenshot.id])

  useEffect(() => {
    const canvas = fabricCanvas.current
    if (!canvas || !ready) return
    toolRef.current = tool
    canvas.isDrawingMode = tool === 'draw' || tool === 'erase'
    canvas.selection = tool === 'select'
    canvas.defaultCursor = tool === 'select' ? 'default' : 'crosshair'
    canvas.getObjects().forEach((object) => {
      const eraserStroke = object.globalCompositeOperation === 'destination-out'
      object.set({ selectable: tool === 'select' && !eraserStroke, evented: tool === 'select' && !eraserStroke })
    })

    if (tool === 'draw' || tool === 'erase') {
      const brush = new PencilBrush(canvas)
      brush.color = tool === 'erase' ? '#000000' : color
      brush.width = strokeWidth
      canvas.freeDrawingBrush = brush
    }

    let start: { x: number; y: number } | undefined
    let line: Line | undefined
    let head: Triangle | undefined

    const mouseDown = (options: TPointerEventInfo) => {
      if (tool === 'text') {
        const point = canvas.getScenePoint(options.e)
        const text = new IText('输入文字', {
          left: point.x,
          top: point.y,
          fill: color,
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: Math.max(18, strokeWidth * 5),
          fontWeight: 600,
        })
        canvas.add(text)
        canvas.setActiveObject(text)
        text.enterEditing()
        text.selectAll()
        canvas.requestRenderAll()
        recordHistory()
        setTool('select')
      } else if (tool === 'arrow') {
        const point = canvas.getScenePoint(options.e)
        start = { x: point.x, y: point.y }
        line = new Line([point.x, point.y, point.x, point.y], {
          stroke: color,
          strokeWidth,
          selectable: false,
          evented: false,
        })
        head = new Triangle({
          left: point.x,
          top: point.y,
          width: strokeWidth * 4,
          height: strokeWidth * 5,
          fill: color,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        })
        canvas.add(line, head)
      }
    }

    const mouseMove = (options: TPointerEventInfo) => {
      if (!start || !line || !head) return
      const point = canvas.getScenePoint(options.e)
      const angle = Math.atan2(point.y - start.y, point.x - start.x) * 180 / Math.PI + 90
      line.set({ x2: point.x, y2: point.y })
      head.set({ left: point.x, top: point.y, angle })
      canvas.requestRenderAll()
    }

    const mouseUp = () => {
      if (!line || !head) return
      canvas.remove(line, head)
      const arrow = new Group([line, head], { selectable: true, evented: true })
      canvas.add(arrow)
      canvas.setActiveObject(arrow)
      canvas.requestRenderAll()
      start = undefined
      line = undefined
      head = undefined
      recordHistory()
      setTool('select')
    }

    canvas.on('mouse:down', mouseDown)
    canvas.on('mouse:move', mouseMove)
    canvas.on('mouse:up', mouseUp)
    canvas.requestRenderAll()
    return () => {
      canvas.off('mouse:down', mouseDown)
      canvas.off('mouse:move', mouseMove)
      canvas.off('mouse:up', mouseUp)
    }
  }, [tool, color, strokeWidth, ready])

  const restoreHistory = async (direction: -1 | 1) => {
    const canvas = fabricCanvas.current
    const nextIndex = historyIndex.current + direction
    if (!canvas || nextIndex < 0 || nextIndex >= history.current.length) return
    restoring.current = true
    await canvas.loadFromJSON(history.current[nextIndex])
    historyIndex.current = nextIndex
    restoring.current = false
    canvas.requestRenderAll()
    forceHistoryRender((value) => value + 1)
  }

  const clearAnnotations = () => {
    const canvas = fabricCanvas.current
    if (!canvas) return
    canvas.remove(...canvas.getObjects())
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    recordHistory()
  }

  const save = async () => {
    const canvas = fabricCanvas.current
    const image = sourceImage.current
    if (!canvas || !image) return
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    const sourceWidth = image.naturalWidth
    const sourceHeight = image.naturalHeight
    const multiplier = sourceWidth / canvas.width
    const annotationLayer = canvas.toCanvasElement(multiplier)
    const output = document.createElement('canvas')
    output.width = sourceWidth
    output.height = sourceHeight
    const context = output.getContext('2d')
    if (!context) return
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight)
    context.drawImage(annotationLayer, 0, 0, sourceWidth, sourceHeight)
    onSave({
      dataUrl: output.toDataURL('image/png'),
      annotationJson: JSON.stringify(canvas.toJSON()),
      annotationWidth: canvas.width,
      annotationHeight: canvas.height,
      originalDataUrl: screenshot.originalDataUrl || screenshot.dataUrl,
    })
    onClose()
  }

  const tools: Array<{ id: Tool; label: string; icon: typeof Pencil }> = [
    { id: 'select', label: '选择', icon: MousePointer2 },
    { id: 'draw', label: '画笔', icon: Pencil },
    { id: 'arrow', label: '箭头', icon: ArrowUpRight },
    { id: 'text', label: '文字', icon: Type },
    { id: 'erase', label: '橡皮擦', icon: Eraser },
  ]

  return (
    <div className="annotator-backdrop" role="dialog" aria-modal="true" aria-label="编辑截图">
      <header className="annotator-header">
        <div><p className="eyebrow">截图批注</p><h2>{screenshot.caption || screenshot.name}</h2></div>
        <button className="icon-button" type="button" title="关闭编辑器" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="annotator-toolbar">
        <div className="annotator-tools" role="group" aria-label="批注工具">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tool === id ? 'active' : ''} type="button" title={label} onClick={() => setTool(id)}><Icon size={17} /><span>{label}</span></button>
          ))}
        </div>
        <div className="annotator-colors" aria-label="批注颜色">
          {COLORS.map((value) => <button key={value} className={color === value ? 'active' : ''} type="button" title={`颜色 ${value}`} style={{ background: value }} onClick={() => setColor(value)} />)}
        </div>
        <label className="stroke-control">粗细<input type="range" min="2" max="18" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} /><span>{strokeWidth}</span></label>
        <span className="toolbar-separator" />
        <button className="icon-button" type="button" title="撤销" disabled={historyIndex.current <= 0} onClick={() => void restoreHistory(-1)}><Undo2 size={17} /></button>
        <button className="icon-button" type="button" title="重做" disabled={historyIndex.current >= history.current.length - 1} onClick={() => void restoreHistory(1)}><Redo2 size={17} /></button>
        <button className="icon-button" type="button" title="清空全部批注" onClick={clearAnnotations}><PaintbrushVertical size={17} /></button>
      </div>
      <main className="annotator-stage">
        {!ready && <div className="annotator-loading"><RotateCcw className="spin" size={20} />正在打开图片</div>}
        <div className="annotator-canvas-stack" style={{ width: canvasSize.width || undefined, height: canvasSize.height || undefined }}>
          <img src={screenshot.originalDataUrl || screenshot.dataUrl} alt="截图底图" />
          <canvas ref={canvasElement} />
        </div>
      </main>
      <footer className="annotator-footer">
        <button className="text-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="button" disabled={!ready} onClick={() => void save()}><Check size={16} />保存批注</button>
      </footer>
    </div>
  )
}
