import { useEffect, useRef } from 'react'
import {
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter,
  Table2, ImagePlus, Undo2, Redo2, RemoveFormatting,
} from 'lucide-react'
import { sanitizeRuleHtml } from '../utils/sanitizeRuleHtml'

const ToolButton = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
  >
    {children}
  </button>
)

const compressImage = (file) => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件'))
  if (file.size > 8 * 1024 * 1024) return reject(new Error('原图不能超过 8MB'))
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('图片读取失败'))
  reader.onload = () => {
    const image = new Image()
    image.onerror = () => reject(new Error('图片格式无法识别'))
    image.onload = () => {
      const ratio = Math.min(1, 1200 / image.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * ratio))
      canvas.height = Math.max(1, Math.round(image.height * ratio))
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/webp', 0.82))
    }
    image.src = reader.result
  }
  reader.readAsDataURL(file)
})

export default function RichTextEditor({ value, onChange, onError }) {
  const editorRef = useRef(null)
  const imageInputRef = useRef(null)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value && document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value])

  const emitChange = () => onChange(sanitizeRuleHtml(editorRef.current?.innerHTML || ''))
  const command = (name, argument = null) => {
    editorRef.current?.focus()
    document.execCommand(name, false, argument)
    emitChange()
  }

  const insertTable = () => {
    const rows = Math.min(12, Math.max(1, Number(window.prompt('表格行数', '4')) || 0))
    const columns = Math.min(8, Math.max(1, Number(window.prompt('表格列数', '3')) || 0))
    if (!rows || !columns) return
    const cells = Array.from({ length: rows }, (_, row) => (
      `<tr>${Array.from({ length: columns }, (_, column) => (
        row === 0 ? `<th>${column === 0 ? '项目' : '内容'}</th>` : '<td>请输入内容</td>'
      )).join('')}</tr>`
    )).join('')
    command('insertHTML', `<table><tbody>${cells}</tbody></table><p><br></p>`)
  }

  const insertImage = async (file) => {
    if (!file) return
    try {
      const source = await compressImage(file)
      command('insertHTML', `<p><img src="${source}" alt="规则图片"></p>`)
    } catch (error) {
      onError?.(error.message)
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 p-3">
        <select onChange={(event) => command('formatBlock', event.target.value)} defaultValue="p" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <option value="p">正文</option><option value="h2">大标题</option><option value="h3">小标题</option><option value="blockquote">引用</option>
        </select>
        <ToolButton title="加粗" onClick={() => command('bold')}><Bold className="h-4 w-4" /></ToolButton>
        <ToolButton title="斜体" onClick={() => command('italic')}><Italic className="h-4 w-4" /></ToolButton>
        <ToolButton title="下划线" onClick={() => command('underline')}><Underline className="h-4 w-4" /></ToolButton>
        <ToolButton title="项目符号" onClick={() => command('insertUnorderedList')}><List className="h-4 w-4" /></ToolButton>
        <ToolButton title="编号列表" onClick={() => command('insertOrderedList')}><ListOrdered className="h-4 w-4" /></ToolButton>
        <ToolButton title="左对齐" onClick={() => command('justifyLeft')}><AlignLeft className="h-4 w-4" /></ToolButton>
        <ToolButton title="居中" onClick={() => command('justifyCenter')}><AlignCenter className="h-4 w-4" /></ToolButton>
        <label title="文字颜色" className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-500">
          颜色<input type="color" defaultValue="#312e81" onChange={(event) => command('foreColor', event.target.value)} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" />
        </label>
        <ToolButton title="插入表格" onClick={insertTable}><Table2 className="h-4 w-4" /></ToolButton>
        <ToolButton title="插入图片" onClick={() => imageInputRef.current?.click()}><ImagePlus className="h-4 w-4" /></ToolButton>
        <ToolButton title="撤销" onClick={() => command('undo')}><Undo2 className="h-4 w-4" /></ToolButton>
        <ToolButton title="重做" onClick={() => command('redo')}><Redo2 className="h-4 w-4" /></ToolButton>
        <ToolButton title="清除格式" onClick={() => command('removeFormat')}><RemoveFormatting className="h-4 w-4" /></ToolButton>
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => insertImage(event.target.files?.[0])} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={(event) => {
          event.preventDefault()
          command('insertText', event.clipboardData.getData('text/plain'))
        }}
        data-placeholder="在这里输入完整的积分规则。可以设置标题、颜色、列表，插入表格和图片……"
        className="rule-content rule-editor min-h-[520px] px-8 py-7 text-[15px] leading-7 text-slate-700 outline-none"
      />
    </div>
  )
}
