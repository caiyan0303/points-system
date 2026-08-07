const ALLOWED_TAGS = new Set([
  'P', 'BR', 'DIV', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S',
  'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'A',
])

const SAFE_STYLES = new Set([
  'color', 'background-color', 'text-align', 'font-size', 'font-weight',
  'font-style', 'text-decoration', 'border', 'border-collapse', 'width',
  'max-width', 'height', 'padding', 'margin', 'vertical-align',
])

const safeUrl = (value, image = false) => {
  const url = String(value || '').trim()
  if (/^https?:\/\//i.test(url)) return url
  if (image && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) return url
  if (!image && /^mailto:/i.test(url)) return url
  return ''
}

export function sanitizeRuleHtml(html = '') {
  if (typeof window === 'undefined') return ''
  const raw = String(html || '')
  if (!raw.trim()) return ''
  const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const prepared = /<\/?[a-z][\s\S]*>/i.test(raw)
    ? raw
    : escaped.split(/\n{2,}/).map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`).join('')
  const doc = new DOMParser().parseFromString(`<div>${prepared}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''

  const clean = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove()
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      if (!ALLOWED_TAGS.has(child.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'].includes(child.tagName)) {
          child.remove()
          return
        }
        clean(child)
        child.replaceWith(...child.childNodes)
        return
      }

      const kept = {}
      if (child.tagName === 'IMG') {
        const src = safeUrl(child.getAttribute('src'), true)
        if (!src) {
          child.remove()
          return
        }
        kept.src = src
        kept.alt = child.getAttribute('alt') || ''
      }
      if (child.tagName === 'A') {
        const href = safeUrl(child.getAttribute('href'))
        if (href) {
          kept.href = href
          kept.target = '_blank'
          kept.rel = 'noopener noreferrer'
        }
      }
      if (['TH', 'TD'].includes(child.tagName)) {
        const colSpan = Number(child.getAttribute('colspan'))
        const rowSpan = Number(child.getAttribute('rowspan'))
        if (colSpan > 1 && colSpan <= 20) kept.colspan = String(colSpan)
        if (rowSpan > 1 && rowSpan <= 50) kept.rowspan = String(rowSpan)
      }

      const safeStyle = []
      Array.from(child.style || []).forEach((property) => {
        if (!SAFE_STYLES.has(property)) return
        const value = child.style.getPropertyValue(property)
        if (/url\s*\(|expression\s*\(|javascript:/i.test(value)) return
        safeStyle.push(`${property}: ${value}`)
      })
      if (safeStyle.length) kept.style = safeStyle.join('; ')

      Array.from(child.attributes).forEach((attribute) => child.removeAttribute(attribute.name))
      Object.entries(kept).forEach(([name, value]) => child.setAttribute(name, value))
      clean(child)
    })
  }

  clean(root)
  return root.innerHTML
}
