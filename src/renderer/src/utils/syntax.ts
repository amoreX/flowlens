export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function tokenizeLine(raw: string): string {
  const result: string[] = []
  const line = raw
  let i = 0

  while (i < line.length) {
    // Single-line comment
    if (line[i] === '/' && line[i + 1] === '/') {
      result.push(`<span class="tok-comment">${escapeHtml(line.slice(i))}</span>`)
      return result.join('')
    }

    // String — double quote
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i]
      let j = i + 1
      while (j < line.length) {
        if (line[j] === '\\') { j += 2; continue }
        if (line[j] === quote) { j++; break }
        j++
      }
      result.push(`<span class="tok-string">${escapeHtml(line.slice(i, j))}</span>`)
      i = j
      continue
    }

    // Numbers
    if (/\d/.test(line[i]) && (i === 0 || /[\s(,=+\-*/<>[\]{}:;!&|^~?]/.test(line[i - 1]))) {
      let j = i
      while (j < line.length && /[\d.xXa-fA-F_]/.test(line[j])) j++
      result.push(`<span class="tok-number">${escapeHtml(line.slice(i, j))}</span>`)
      i = j
      continue
    }

    // Words — keywords, function names, or plain identifiers
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++
      const word = line.slice(i, j)

      if (KEYWORDS.has(word)) {
        result.push(`<span class="tok-keyword">${escapeHtml(word)}</span>`)
      } else if (j < line.length && line[j] === '(') {
        result.push(`<span class="tok-fn">${escapeHtml(word)}</span>`)
      } else {
        result.push(escapeHtml(word))
      }
      i = j
      continue
    }

    // JSX tags: < followed by uppercase or lowercase letter
    if (line[i] === '<' && i + 1 < line.length && /[a-zA-Z/]/.test(line[i + 1])) {
      let j = i + 1
      if (line[j] === '/') j++
      const tagStart = j
      while (j < line.length && /[a-zA-Z0-9.]/.test(line[j])) j++
      const tagName = line.slice(tagStart, j)
      if (tagName) {
        result.push(`${escapeHtml(line.slice(i, tagStart))}<span class="tok-tag">${escapeHtml(tagName)}</span>`)
        i = j
        continue
      }
    }

    // Default: emit character
    result.push(escapeHtml(line[i]))
    i++
  }

  return result.join('')
}

export const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'this', 'class', 'extends',
  'import', 'export', 'from', 'default', 'async', 'await', 'try', 'catch', 'throw',
  'typeof', 'instanceof', 'in', 'of', 'null', 'undefined', 'true', 'false',
  'void', 'yield', 'type', 'interface', 'enum', 'as', 'implements'
])
