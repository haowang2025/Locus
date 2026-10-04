import type { MeaningUnit, SourceSpan } from './palaceTypes'

export function sourceSpan(text: string, start: number, end: number): SourceSpan {
  return { start, end, quote: text.slice(start, end) }
}

export function protectedTokens(text: string): string[] {
  const tokens: Array<{ index: number; value: string }> = []
  for (const match of text.matchAll(/不(?:得|能|应|可|是)?|禁止|除非|仅当|至少|至多|如果|否则|无|未|not\b|never\b|unless\b|only\b/giu)) tokens.push({ index: match.index, value: match[0] })
  for (const match of text.matchAll(/[-+]?\d+(?:[.,]\d+)*(?:\s*(?:%|％|℃|°C|kg|mg|km|cm|mm|m\/s|万元|亿元|元|年|月|日|天|小时|分钟|秒|米|克|倍))?/gu)) tokens.push({ index: match.index, value: match[0] })
  // Find operators first, then inspect bounded context. An unbounded greedy
  // formula regex would rescan every suffix of a long unbroken input (quadratic).
  for (const match of text.matchAll(/[=≠≤≥<>]/g)) {
    const index = match.index, left = text.slice(Math.max(0, index - 80), index).match(/[^\s，。；;]*\s*$/)?.[0] ?? ''
    const right = text.slice(index + 1, index + 81).match(/^\s*[^\s，。；;]*/)?.[0] ?? ''
    tokens.push({ index, value: `${left}${match[0]}${right}`.trim() })
  }
  return [...new Set(tokens.sort((a, b) => a.index - b.index).map(t => t.value))]
}

export function coalesceAdjacentSpans(text: string, spans: SourceSpan[]): SourceSpan[] {
  const result: SourceSpan[] = []
  for (const span of spans) {
    const previous = result.at(-1)
    if (previous && span.start >= previous.end && !text.slice(previous.end, span.start).trim()) result[result.length - 1] = sourceSpan(text, previous.start, span.end)
    else result.push({ ...span })
  }
  return result
}

export function makeUnit(text: string, spans: SourceSpan[], id: string): MeaningUnit {
  spans = coalesceAdjacentSpans(text, spans)
  const facts = spans.map(s => text.slice(s.start, s.end)).join('\n')
  const first = facts.trim().split(/\r?\n/)[0] ?? ''
  const titleCharacters = Array.from(first)
  return { id, spans: spans.map(s => sourceSpan(text, s.start, s.end)), title: titleCharacters.length > 42 ? `${titleCharacters.slice(0, 42).join('')}…` : first, question: '请完整回忆这一单元的要点、关系、数字与条件，并保留否定表述。', facts, protectedTokens: protectedTokens(facts), reviewed: false }
}

// Conservative English sentence ends. Keep decimal/version strings, initials,
// common abbreviations, URLs and formula punctuation intact. This is a fallback
// boundary heuristic, not semantic parsing; uncertain cases stay together.
const ENGLISH_ABBREVIATION = /^(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|dept|fig|eq|no|vol|pp|p|ch|sec|inc|ltd|co|corp|rev|gen|sen|rep|hon|mt|ft|oz|lb|lbs|min|max|misc|resp|al)$/i
function englishSentenceEnd(text: string, offset: number, start: number): boolean {
  if (text[offset] !== '.' || text[offset - 1] === '.' || text[offset + 1] === '.') return false
  if (offset + 1 === text.length) return true
  if (!/^\s+["'“‘(]*[A-Z][a-zA-Z]/.test(text.slice(offset + 1, offset + 32))) return false
  const before = text.slice(Math.max(start, offset - 160), offset)
  const token = before.match(/([^\s]+)$/)?.[1] ?? ''
  const word = token.replace(/^["'“‘([]+/, '')
  if (!word || /^\d+(?:\.\d+)*$/.test(word) || /^[A-Za-z]$/.test(word) || ENGLISH_ABBREVIATION.test(word)) return false
  // Initialisms and dotted identifiers are deliberately not guessed apart.
  if (/[.@/:\\]/.test(word)) return false
  // A compact operator expression may contain an English-looking symbol name.
  if (/[=<>≤≥≠+*/^]/.test(word)) return false
  return true
}

/** Deterministic fallback, NOT semantic AI. Keeps every non-whitespace source character.
 * Newlines and Chinese sentence ends are candidates; formulas/decimal points stay intact.
 * Short neighboring fragments remain together to avoid treating every line as one fact.
 */
export function segmentSource(text: string, maxUnits = Number.POSITIVE_INFINITY): MeaningUnit[] {
  if (!text.trim()) return []
  const spans: SourceSpan[] = []
  let start = 0
  const add = (end: number) => {
    if (text.slice(start, end).trim()) {
      if (spans.length >= maxUnits) throw new Error(`检测到超过 ${maxUnits} 个候选句段。原文完整保留；请按章节分成多个宫殿再处理。不会截断，也不会把全部内容强塞到同一场景。`)
      spans.push(sourceSpan(text, start, end))
    }
    start = end
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const part = text.slice(start, i + 1)
    const blankLine = c === '\n' && /^\s*\n/.test(text.slice(i + 1))
    const punctuation = /[。！？!?]/.test(c) && (i + 1 === text.length || !/[」』”’)]/.test(text[i + 1]))
    const lineBoundary = c === '\n' && (part.trim().length >= 36 || /^\s*(?:\d+[.)、]|[-*•]|第[一二三四五六七八九十\d]+[步条])/.test(text.slice(i + 1)))
    if (blankLine || punctuation || lineBoundary || (c === '.' && englishSentenceEnd(text, i, start))) add(i + 1)
  }
  add(text.length)
  return spans.map((span, i) => makeUnit(text, [span], `unit-${i + 1}`))
}

export function mergeUnits(text: string, left: MeaningUnit, right: MeaningUnit): MeaningUnit {
  return makeUnit(text, [...left.spans, ...right.spans].sort((a, b) => a.start - b.start), left.id)
}

/** Split only at a source offset, never by rewriting the evidence. */
export function splitUnit(text: string, unit: MeaningUnit, offset: number): [MeaningUnit, MeaningUnit] {
  if (!Number.isInteger(offset)) throw new Error('拆分位置必须是整数原文偏移。')
  const left: SourceSpan[] = [], right: SourceSpan[] = []
  for (const span of unit.spans) {
    if (span.end <= offset) left.push(span)
    else if (span.start >= offset) right.push(span)
    else { left.push(sourceSpan(text, span.start, offset)); right.push(sourceSpan(text, offset, span.end)) }
  }
  if (!left.map(s => s.quote).join('').trim() || !right.map(s => s.quote).join('').trim()) throw new Error('请选择该单元原文内部的拆分位置，两侧都须有内容。')
  // Avoid splitting a UTF-16 surrogate pair.
  if (/[\uD800-\uDBFF]/.test(text[offset - 1] ?? '') && /[\uDC00-\uDFFF]/.test(text[offset] ?? '')) throw new Error('不能拆开一个字符。')
  return [makeUnit(text, left, unit.id), makeUnit(text, right, `${unit.id}-split-${offset}`)]
}

/** Maps the cursor in the evidence textarea back to its exact source coordinate. */
export function sourceOffsetAtCursor(unit: MeaningUnit, cursor: number): number {
  let remaining = Math.max(0, cursor)
  for (const span of unit.spans) {
    if (remaining <= span.quote.length) return span.start + remaining
    remaining -= span.quote.length + 1 // facts joins disjoint spans with one newline.
  }
  return unit.spans.at(-1)?.end ?? 0
}
