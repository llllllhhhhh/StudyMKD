import { useEffect } from 'react'
import Highlight from '@tiptap/extension-highlight'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import {
  Bold,
  Code2,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RotateCcw,
} from 'lucide-react'

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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder: '记录你的理解、结论和问题…' }),
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

  const setCodeLanguage = (language: string) => {
    if (!language) return
    const chain = editor.chain().focus()
    if (!editor.isActive('codeBlock')) chain.toggleCodeBlock()
    chain.updateAttributes('codeBlock', { language: language === 'text' ? null : language }).run()
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
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
