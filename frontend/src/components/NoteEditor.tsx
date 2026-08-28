import { useEffect, useRef, useState } from 'react'
import Highlight from '@tiptap/extension-highlight'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Code2,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { findNoteSearchMatches, NoteSearchExtension, noteSearchPluginKey } from '../lib/noteSearch'

const lowlight = createLowlight(common)

const CODE_LANGUAGES = [
  { value: 'text', label: '纯文本' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Shell' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
]

interface Props {
  chapterId: string
  content: string
  onChange: (html: string) => void
  onSelectionChange: (text: string) => void
}

export default function NoteEditor({ chapterId, content, onChange, onSelectionChange }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const searchInput = useRef<HTMLInputElement>(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder: '记录你的理解、结论和问题…' }),
      NoteSearchExtension,
    ],
    content,
    editorProps: { attributes: { class: 'editor-surface' } },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection
      onSelectionChange(currentEditor.state.doc.textBetween(from, to, ' ').trim())
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(content, { emitUpdate: false })
  }, [chapterId, editor])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveMatch(0)
  }, [chapterId])

  useEffect(() => {
    if (!searchOpen) return
    searchInput.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!editor) return
    const query = searchOpen ? searchQuery : ''
    const matches = findNoteSearchMatches(editor.state.doc, query)
    const safeIndex = matches.length ? ((activeMatch % matches.length) + matches.length) % matches.length : 0
    if (safeIndex !== activeMatch) {
      setActiveMatch(safeIndex)
      return
    }
    editor.view.dispatch(editor.state.tr.setMeta(noteSearchPluginKey, { query, activeIndex: safeIndex }))
    if (query && matches.length) {
      window.requestAnimationFrame(() => {
        editor.view.dom.querySelector('.note-search-current')?.scrollIntoView({ block: 'center', behavior: 'auto' })
      })
    }
  }, [activeMatch, content, editor, searchOpen, searchQuery])

  if (!editor) return null

  const tools = [
    { title: '粗体', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { title: '斜体', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { title: '重点标记', icon: Highlighter, active: editor.isActive('highlight'), run: () => editor.chain().focus().toggleHighlight().run() },
    { title: '二级标题', icon: Heading2, active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { title: '无序列表', icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { title: '有序列表', icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
    { title: '引用', icon: Quote, active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
    { title: '代码块', icon: Code2, active: editor.isActive('codeBlock'), run: () => editor.chain().focus().toggleCodeBlock().run() },
  ]

  const codeBlockActive = editor.isActive('codeBlock')
  const currentLanguage = codeBlockActive ? editor.getAttributes('codeBlock').language || 'text' : ''
  const searchMatches = searchOpen ? findNoteSearchMatches(editor.state.doc, searchQuery) : []
  const searchMatchCount = searchMatches.length
  const visibleMatchIndex = searchMatchCount ? (activeMatch % searchMatchCount) + 1 : 0

  const setCodeLanguage = (language: string) => {
    if (!language) return
    const chain = editor.chain().focus()
    if (!editor.isActive('codeBlock')) chain.toggleCodeBlock()
    chain.updateAttributes('codeBlock', { language: language === 'text' ? null : language }).run()
  }

  const moveSearch = (direction: number) => {
    if (!searchMatchCount) return
    setActiveMatch((current) => (current + direction + searchMatchCount) % searchMatchCount)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveMatch(0)
  }

  return (
    <div className="editor-shell">
      <div className="editor-toolbar">
        {tools.map(({ title, icon: Icon, active, run }) => (
          <button key={title} className={`icon-button ${active ? 'active' : ''}`} title={title} onClick={run} type="button">
            <Icon size={17} />
          </button>
        ))}
        <select className="code-language-select" aria-label="代码语言" title="选择代码语言" value={currentLanguage} onChange={(event) => setCodeLanguage(event.target.value)}>
          <option value="" disabled>代码语言</option>
          {CODE_LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
        </select>
        <span className="toolbar-separator" />
        <button className="icon-button" title="撤销" onClick={() => editor.chain().focus().undo().run()} type="button"><RotateCcw size={17} /></button>
        <button className="icon-button" title="重做" onClick={() => editor.chain().focus().redo().run()} type="button"><Redo2 size={17} /></button>
        <span className="toolbar-separator" />
        <button className={`icon-button ${searchOpen ? 'active' : ''}`} title="搜索笔记内容" onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)} type="button"><Search size={17} /></button>
      </div>
      {searchOpen && (
        <div className="note-search-bar" role="search">
          <Search size={15} />
          <input
            ref={searchInput}
            aria-label="搜索笔记内容"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setActiveMatch(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeSearch()
              if (event.key === 'Enter') {
                event.preventDefault()
                moveSearch(event.shiftKey ? -1 : 1)
              }
            }}
            placeholder="输入笔记关键词"
          />
          <span className="note-search-count">{visibleMatchIndex}/{searchMatchCount}</span>
          <button className="icon-button" type="button" title="上一个匹配" disabled={!searchMatchCount} onClick={() => moveSearch(-1)}><ChevronUp size={15} /></button>
          <button className="icon-button" type="button" title="下一个匹配" disabled={!searchMatchCount} onClick={() => moveSearch(1)}><ChevronDown size={15} /></button>
          <button className="icon-button" type="button" title="关闭搜索" onClick={closeSearch}><X size={15} /></button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
